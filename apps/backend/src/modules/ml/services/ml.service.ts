import {
  Injectable,
  Logger,
  NotFoundException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, MoreThan } from 'typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';
import { EventEmitter2 } from '@nestjs/event-emitter';

import { MlModel, HazardType } from '../entities/ml-model.entity';
import { MlModelVersion, ModelVersionStatus } from '../entities/ml-model-version.entity';
import { RiskPrediction, PredictionStatus } from '../entities/risk-prediction.entity';
import { FeatureDefinition } from '../entities/feature-definition.entity';
import { ModelPerformanceSnapshot, DriftSeverity } from '../entities/model-performance-snapshot.entity';
import {
  CreateMlModelDto,
  RegisterModelVersionDto,
  PromoteModelVersionDto,
  CreateRiskPredictionDto,
  ReviewPredictionDto,
  CreateFeatureDefinitionDto,
  PaginationDto,
} from '../dto/ml.dto';

/** PSI thresholds for drift classification */
const PSI_LOW      = 0.1;
const PSI_MODERATE = 0.2;
const PSI_HIGH     = 0.25;

@Injectable()
export class MlService {
  private readonly logger = new Logger(MlService.name);

  constructor(
    @InjectRepository(MlModel)
    private readonly modelRepo: Repository<MlModel>,
    @InjectRepository(MlModelVersion)
    private readonly versionRepo: Repository<MlModelVersion>,
    @InjectRepository(RiskPrediction)
    private readonly predictionRepo: Repository<RiskPrediction>,
    @InjectRepository(FeatureDefinition)
    private readonly featureDefRepo: Repository<FeatureDefinition>,
    @InjectRepository(ModelPerformanceSnapshot)
    private readonly snapshotRepo: Repository<ModelPerformanceSnapshot>,
    @InjectDataSource()
    private readonly dataSource: DataSource,
    private readonly events: EventEmitter2,
  ) {}

  // ── Model Registry ──────────────────────────────────────────────────────────

  async createModel(dto: CreateMlModelDto, actorId: string): Promise<MlModel> {
    const existing = await this.modelRepo.findOne({ where: { name: dto.name } });
    if (existing) throw new ConflictException(`Model "${dto.name}" already exists`);

    const model = this.modelRepo.create({
      ...dto,
      preprocessingConfig: dto.preprocessingConfig ?? {},
      classification: dto.classification ?? 1,
    });
    const saved = await this.modelRepo.save(model);
    this.events.emit('ml.model.created', { modelId: saved.id, hazardType: saved.hazardType, actorId });
    return saved;
  }

  async listModels(hazardType?: HazardType): Promise<MlModel[]> {
    const where = hazardType ? { hazardType, isActive: true } : { isActive: true };
    return this.modelRepo.find({ where, order: { createdAt: 'DESC' }, relations: ['versions'] });
  }

  async getModel(id: string, userClearance: number): Promise<MlModel> {
    const model = await this.modelRepo.findOne({ where: { id }, relations: ['versions'] });
    if (!model) throw new NotFoundException(`MlModel ${id} not found`);
    if (model.classification > userClearance) throw new ForbiddenException('Insufficient clearance');
    return model;
  }

  // ── Model Versions ──────────────────────────────────────────────────────────

  async registerVersion(dto: RegisterModelVersionDto, actorId: string): Promise<MlModelVersion> {
    const model = await this.modelRepo.findOne({ where: { id: dto.modelId } });
    if (!model) throw new NotFoundException(`MlModel ${dto.modelId} not found`);

    const existing = await this.versionRepo.findOne({
      where: { modelId: dto.modelId, version: dto.version },
    });
    if (existing) throw new ConflictException(`Version ${dto.version} already registered for this model`);

    const version = this.versionRepo.create({
      modelId:             dto.modelId,
      version:             dto.version,
      status:              ModelVersionStatus.TRAINING,
      mlflowRunId:         dto.mlflowRunId ?? null,
      mlflowVersion:       dto.mlflowVersion ?? null,
      artifactUri:         dto.artifactUri ?? null,
      trainingDatasetMeta: dto.trainingDatasetMeta ?? {},
      hyperparameters:     dto.hyperparameters ?? {},
      evalMetrics:         dto.evalMetrics ?? {},
      featureImportances:  dto.featureImportances ?? {},
    });
    const saved = await this.versionRepo.save(version);
    this.events.emit('ml.version.registered', { versionId: saved.id, modelId: dto.modelId, actorId });
    return saved;
  }

  async promoteVersion(
    versionId: string,
    dto: PromoteModelVersionDto,
    actorId: string,
    userClearance: number,
  ): Promise<MlModelVersion> {
    const version = await this.versionRepo.findOne({
      where: { id: versionId },
      relations: ['model'],
    });
    if (!version) throw new NotFoundException(`MlModelVersion ${versionId} not found`);
    if (version.model.classification > userClearance) throw new ForbiddenException('Insufficient clearance');

    // Demote existing production version if promoting new one to production
    if (dto.targetStatus === ModelVersionStatus.PRODUCTION) {
      await this.versionRepo.update(
        { modelId: version.modelId, status: ModelVersionStatus.PRODUCTION },
        { status: ModelVersionStatus.ARCHIVED, archivedAt: new Date() },
      );
      version.promotedToProductionAt = new Date();
    }

    version.status      = dto.targetStatus;
    version.reviewedById = actorId;
    version.reviewedAt  = new Date();
    version.reviewNotes = dto.reviewNotes ?? null;

    const saved = await this.versionRepo.save(version);
    this.events.emit('ml.version.promoted', {
      versionId: saved.id,
      modelId: version.modelId,
      targetStatus: dto.targetStatus,
      actorId,
    });
    return saved;
  }

  async getProductionVersion(modelId: string): Promise<MlModelVersion | null> {
    return this.versionRepo.findOne({
      where: { modelId, status: ModelVersionStatus.PRODUCTION },
      order: { promotedToProductionAt: 'DESC' },
    });
  }

  /**
   * Rollback a production model version to STAGING.
   * The previous STAGING version (if any) is promoted back to PRODUCTION.
   * Used when a deployed model exhibits unacceptable drift or prediction quality. §10.4
   */
  async rollbackVersion(
    versionId: string,
    reason: string,
    actorId: string,
  ): Promise<MlModelVersion> {
    const version = await this.versionRepo.findOne({ where: { id: versionId } });
    if (!version) throw new NotFoundException(`MlModelVersion ${versionId} not found`);
    if (version.status !== ModelVersionStatus.PRODUCTION) {
      throw new ConflictException(`Version ${versionId} is not in PRODUCTION status — cannot roll back`);
    }

    version.status      = ModelVersionStatus.STAGING;
    version.reviewNotes = `[ROLLBACK] ${reason}`;
    version.reviewedById = actorId;
    version.reviewedAt   = new Date();
    await this.versionRepo.save(version);

    // Promote the most recent STAGING version for same model back to PRODUCTION (if exists)
    const prevStaging = await this.versionRepo.findOne({
      where: { modelId: version.modelId, status: ModelVersionStatus.STAGING },
      order: { createdAt: 'DESC' },
    });

    let promoted: MlModelVersion | null = null;
    if (prevStaging && prevStaging.id !== versionId) {
      prevStaging.status               = ModelVersionStatus.PRODUCTION;
      prevStaging.promotedToProductionAt = new Date();
      prevStaging.reviewedById          = actorId;
      prevStaging.reviewedAt            = new Date();
      prevStaging.reviewNotes           = `[AUTO-PROMOTED on rollback of ${versionId}]`;
      promoted = await this.versionRepo.save(prevStaging);
    }

    this.events.emit('ml.version.rolled_back', {
      rolledBackVersionId: versionId,
      modelId: version.modelId,
      promotedVersionId: promoted?.id ?? null,
      reason,
      actorId,
    });

    this.logger.warn(`Rolled back production version ${versionId} for model ${version.modelId}. Reason: ${reason}`);
    return version;
  }

  // ── Risk Predictions ────────────────────────────────────────────────────────

  async createPrediction(dto: CreateRiskPredictionDto): Promise<RiskPrediction> {
    const version = await this.versionRepo.findOne({ where: { id: dto.modelVersionId } });
    if (!version) throw new NotFoundException(`MlModelVersion ${dto.modelVersionId} not found`);

    const prediction = this.predictionRepo.create({
      modelVersionId:    dto.modelVersionId,
      hazardType:        dto.hazardType,
      administrativeCode: dto.administrativeCode,
      administrativeName: dto.administrativeName ?? null,
      riskScore:         dto.riskScore,
      riskTier:          dto.riskTier,
      shapValues:        dto.shapValues ?? {},
      inputFeatures:     dto.inputFeatures ?? {},
      confidenceInterval: dto.confidenceInterval ?? null,
      validFrom:         new Date(dto.validFrom),
      validUntil:        new Date(dto.validUntil),
      classification:    dto.classification ?? 1,
      status:            PredictionStatus.PENDING,
    });
    const saved = await this.predictionRepo.save(prediction);
    this.events.emit('ml.prediction.created', {
      predictionId: saved.id,
      hazardType:   saved.hazardType,
      adminCode:    saved.administrativeCode,
      riskTier:     saved.riskTier,
    });
    return saved;
  }

  /**
   * Bulk ingest predictions from an external ML pipeline.
   * All items in the batch must share the same modelVersionId.
   * Returns the created prediction records.
   */
  async batchCreatePredictions(
    dtos: CreateRiskPredictionDto[],
  ): Promise<{ created: number; ids: string[] }> {
    if (!dtos.length) return { created: 0, ids: [] };

    const modelVersionId = dtos[0].modelVersionId;
    const version = await this.versionRepo.findOne({ where: { id: modelVersionId } });
    if (!version) throw new NotFoundException(`MlModelVersion ${modelVersionId} not found`);

    const entities = dtos.map((dto) =>
      this.predictionRepo.create({
        modelVersionId:     dto.modelVersionId,
        hazardType:         dto.hazardType,
        administrativeCode: dto.administrativeCode,
        administrativeName: dto.administrativeName ?? null,
        riskScore:          dto.riskScore,
        riskTier:           dto.riskTier,
        shapValues:         dto.shapValues ?? {},
        inputFeatures:      dto.inputFeatures ?? {},
        confidenceInterval: dto.confidenceInterval ?? null,
        validFrom:          new Date(dto.validFrom),
        validUntil:         new Date(dto.validUntil),
        classification:     dto.classification ?? 1,
        status:             PredictionStatus.PENDING,
      }),
    );

    const saved = await this.predictionRepo.save(entities, { chunk: 500 });
    const ids = saved.map((p) => p.id);

    this.events.emit('ml.predictions.batch_created', {
      count: saved.length,
      modelVersionId,
      hazardType: dtos[0].hazardType,
    });

    this.logger.log(`Batch ingested ${saved.length} predictions for model version ${modelVersionId}`);
    return { created: saved.length, ids };
  }

  async getPendingPredictions(
    hazardType?: HazardType,
    userClearance = 1,
    pagination: PaginationDto = {},
  ): Promise<{ items: RiskPrediction[]; total: number }> {
    const { page = 1, limit = 50 } = pagination;
    const qb = this.predictionRepo
      .createQueryBuilder('p')
      .where('p.status = :status', { status: PredictionStatus.PENDING })
      .andWhere('p.classification <= :cl', { cl: userClearance })
      .andWhere('p.valid_until > NOW()')
      .orderBy('p.predicted_at', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    if (hazardType) qb.andWhere('p.hazard_type = :ht', { ht: hazardType });

    const [items, total] = await qb.getManyAndCount();
    return { items, total };
  }

  async reviewPrediction(
    predictionId: string,
    dto: ReviewPredictionDto,
    actorId: string,
    userClearance: number,
  ): Promise<RiskPrediction> {
    const prediction = await this.predictionRepo.findOne({ where: { id: predictionId } });
    if (!prediction) throw new NotFoundException(`RiskPrediction ${predictionId} not found`);
    if (prediction.classification > userClearance) throw new ForbiddenException('Insufficient clearance');
    if (prediction.status !== PredictionStatus.PENDING) {
      throw new ConflictException(`Prediction is already ${prediction.status}`);
    }

    prediction.status      = dto.status;
    prediction.reviewedById = actorId;
    prediction.reviewedAt  = new Date();
    prediction.reviewNotes = dto.reviewNotes ?? null;

    const saved = await this.predictionRepo.save(prediction);

    if (saved.status === PredictionStatus.APPROVED) {
      this.events.emit('ml.prediction.approved', {
        predictionId: saved.id,
        hazardType:   saved.hazardType,
        adminCode:    saved.administrativeCode,
        riskTier:     saved.riskTier,
      });
    }
    return saved;
  }

  async publishApprovedPredictions(): Promise<number> {
    // Collect approved predictions before updating so we can pass hazardTypes + batch data
    const approved = await this.predictionRepo.find({
      where: { status: PredictionStatus.APPROVED },
      select: ['id', 'hazardType', 'administrativeCode', 'administrativeName', 'riskScore', 'riskTier', 'shapValues', 'inputFeatures', 'confidenceInterval', 'validFrom', 'validUntil', 'classification'],
    });

    if (!approved.length) return 0;

    const ids = approved.map((p) => p.id);
    await this.predictionRepo
      .createQueryBuilder()
      .update()
      .set({ status: PredictionStatus.PUBLISHED })
      .whereInIds(ids)
      .execute();

    const count = approved.length;
    const hazardTypes = [...new Set(approved.map((p) => p.hazardType))];

    this.logger.log(`Published ${count} approved risk predictions (hazard types: ${hazardTypes.join(', ')})`);

    // Group predictions by hazardType so GIS can create one draft layer per type
    const byHazardType: Record<string, typeof approved> = {};
    for (const p of approved) {
      (byHazardType[p.hazardType] ??= []).push(p);
    }

    // §12.1: Emit with full prediction data so the GIS listener can create SpatialFeatures
    this.events.emit('ml.predictions.published', {
      count,
      hazardTypes,
      batchId: `batch-${Date.now()}`,
      byHazardType,
    });

    return count;
  }

  async getPublishedPredictions(
    hazardType: HazardType,
    userClearance = 1,
  ): Promise<RiskPrediction[]> {
    return this.predictionRepo.find({
      where: {
        hazardType,
        status: PredictionStatus.PUBLISHED,
        classification: userClearance as any,
      },
      order: { predictedAt: 'DESC' },
    });
  }

  // ── Feature Store ───────────────────────────────────────────────────────────

  async upsertFeatureDefinition(dto: CreateFeatureDefinitionDto): Promise<FeatureDefinition> {
    const existing = await this.featureDefRepo.findOne({ where: { name: dto.name } });
    if (existing) {
      Object.assign(existing, dto);
      return this.featureDefRepo.save(existing);
    }
    const def = this.featureDefRepo.create(dto as Partial<FeatureDefinition>);
    return this.featureDefRepo.save(def);
  }

  async listFeatureDefinitions(): Promise<FeatureDefinition[]> {
    return this.featureDefRepo.find({ where: { isActive: true }, order: { name: 'ASC' } });
  }

  // ── Performance Monitoring ──────────────────────────────────────────────────

  async recordPerformanceSnapshot(
    modelVersionId: string,
    windowStart: Date,
    windowEnd: Date,
    featureDrift: Record<string, number>,
    scoreDistribution: object,
    predictionCount: number,
    accuracyMetrics?: object,
  ): Promise<ModelPerformanceSnapshot> {
    const maxPsi = Math.max(0, ...Object.values(featureDrift));
    const driftSeverity = this.classifyDrift(maxPsi);
    const alertTriggered = maxPsi >= PSI_HIGH;

    const snapshot = this.snapshotRepo.create({
      modelVersionId,
      windowStart,
      windowEnd,
      predictionCount,
      featureDrift,
      maxPsi,
      driftSeverity,
      scoreDistribution,
      accuracyMetrics: accuracyMetrics ?? null,
      alertTriggered,
      alertDetails: alertTriggered
        ? { reason: 'feature_drift', max_psi: maxPsi, threshold: PSI_HIGH }
        : null,
    });
    const saved = await this.snapshotRepo.save(snapshot);

    if (alertTriggered) {
      this.logger.warn(
        `Model drift alert for version ${modelVersionId}: max PSI ${maxPsi.toFixed(3)} >= ${PSI_HIGH}`,
      );
      this.events.emit('ml.drift.alert', {
        modelVersionId,
        maxPsi,
        driftSeverity,
        snapshotId: saved.id,
      });

      // §10.4 — Auto-rollback recommendation: when drift is HIGH, check if a
      // fallback STAGING version exists and emit a rollback recommendation event.
      // Actual rollback requires human confirmation (PATCH /ml/versions/:id/rollback).
      if (driftSeverity === DriftSeverity.HIGH) {
        setImmediate(() => this.emitRollbackRecommendation(modelVersionId, maxPsi, saved.id));
      }
    }
    return saved;
  }

  private async emitRollbackRecommendation(
    productionVersionId: string,
    maxPsi: number,
    snapshotId: string,
  ): Promise<void> {
    try {
      const productionVersion = await this.versionRepo.findOne({
        where: { id: productionVersionId },
      });
      if (!productionVersion || productionVersion.status !== ModelVersionStatus.PRODUCTION) return;

      // Find the most recent STAGING version for the same model as a rollback candidate
      const candidate = await this.versionRepo.findOne({
        where: {
          modelId: productionVersion.modelId,
          status: ModelVersionStatus.STAGING,
        },
        order: { createdAt: 'DESC' },
      });

      this.events.emit('ml.rollback.recommended', {
        productionVersionId,
        modelId: productionVersion.modelId,
        maxPsi,
        snapshotId,
        candidateVersionId: candidate?.id ?? null,
        hasFallback: !!candidate,
        recommendedAt: new Date().toISOString(),
      });

      this.logger.warn(
        `Rollback recommendation emitted for production version ${productionVersionId} ` +
        `(PSI=${maxPsi.toFixed(3)}, candidate=${candidate?.id ?? 'none'})`,
      );
    } catch (err) {
      this.logger.error(`Failed to emit rollback recommendation: ${(err as Error).message}`);
    }
  }

  async getPerformanceHistory(
    modelVersionId: string,
    sinceDate?: Date,
  ): Promise<ModelPerformanceSnapshot[]> {
    const where: any = { modelVersionId };
    if (sinceDate) where.snapshotAt = MoreThan(sinceDate);
    return this.snapshotRepo.find({ where, order: { snapshotAt: 'DESC' }, take: 90 });
  }

  // ── Scheduled: expire stale predictions ────────────────────────────────────

  @Cron(CronExpression.EVERY_HOUR)
  async expireStalePredictons(): Promise<void> {
    const result = await this.predictionRepo
      .createQueryBuilder()
      .update(RiskPrediction)
      .set({ status: PredictionStatus.EXPIRED })
      .where('status IN (:...statuses)', {
        statuses: [PredictionStatus.PENDING, PredictionStatus.APPROVED],
      })
      .andWhere('valid_until < NOW()')
      .execute();

    if ((result.affected ?? 0) > 0) {
      this.logger.log(`Expired ${result.affected} stale risk predictions`);
    }
  }

  // ── Helpers ─────────────────────────────────────────────────────────────────

  private classifyDrift(maxPsi: number): DriftSeverity {
    if (maxPsi >= PSI_HIGH)     return DriftSeverity.HIGH;
    if (maxPsi >= PSI_MODERATE) return DriftSeverity.MODERATE;
    if (maxPsi >= PSI_LOW)      return DriftSeverity.LOW;
    return DriftSeverity.NONE;
  }
}
