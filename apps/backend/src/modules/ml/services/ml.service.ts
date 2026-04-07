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
    const result = await this.predictionRepo.update(
      { status: PredictionStatus.APPROVED },
      { status: PredictionStatus.PUBLISHED },
    );
    const count = result.affected ?? 0;
    if (count > 0) {
      this.logger.log(`Published ${count} approved risk predictions to GIS layers`);
      this.events.emit('ml.predictions.published', { count });
    }
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
    }
    return saved;
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
