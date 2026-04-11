import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';

import { SpatialLayer, LayerStatus, GeometryType, UpdateCadence, QualityStatus } from '../entities/spatial-layer.entity';
import { AuditService } from '../../audit/services/audit.service';

/**
 * GIS ← ML/AI integration listener (§12.1 — Risk Layer Publication Workflow).
 *
 * Bridges the ML domain and the GIS domain by converting approved ML predictions
 * into draft spatial layers for analyst review before they become OPERATIONAL.
 *
 * Workflow:
 *  1. ML pipeline completes → emits `ml.prediction.batch_complete`
 *  2. This listener creates a DRAFT spatial layer (not visible to operators)
 *  3. Analyst is notified via `gis.ai_layer.pending_review` event
 *  4. Analyst approves → GisService.approveAiLayer() → layer → ACTIVE + alert emitted
 *  5. Analyst rejects → GisService.rejectAiLayer() → layer → DEPRECATED + reason recorded
 *
 * This ensures no AI output reaches operational map viewers without analyst validation.
 * Human accountability is maintained — the approving analyst ID is recorded.
 */
@Injectable()
export class GisMlListener {
  private readonly logger = new Logger(GisMlListener.name);

  /** System actor ID used when creating AI-generated layers automatically */
  private static readonly SYSTEM_ACTOR = '00000000-0000-0000-0000-000000000000';
  /** System owner position used for AI-generated layers (AI model service position) */
  private static readonly AI_OWNER_POSITION = '00000000-0000-0000-0000-000000000001';

  constructor(
    @InjectRepository(SpatialLayer)
    private readonly layerRepo: Repository<SpatialLayer>,
    private readonly auditService: AuditService,
    private readonly events: EventEmitter2,
  ) {}

  // ─── ML prediction batch complete → create draft layer ───────────────────────

  /**
   * A prediction batch has completed. Create a DRAFT risk layer for each
   * distinct hazard type in the batch so analysts can review and approve.
   *
   * Payload expected from MlService.publishApprovedPredictions():
   * ```json
   * { "count": 15, "hazardTypes": ["flood", "landslide"], "batchId": "..." }
   * ```
   */
  @OnEvent('ml.predictions.published')
  async onPredictionsPublished(event: {
    count: number;
    hazardTypes?: string[];
    batchId?: string;
  }): Promise<void> {
    if (!event.count) return;

    const hazardTypes = event.hazardTypes ?? ['multi'];

    for (const hazardType of hazardTypes) {
      try {
        await this.createDraftRiskLayer(hazardType, event.batchId ?? null);
      } catch (err) {
        this.logger.error(
          `Failed to create draft risk layer for hazard type ${hazardType}: ${(err as Error).message}`,
        );
      }
    }
  }

  /**
   * A single prediction was approved by an analyst in the ML domain.
   * This event signals that individual prediction outputs are ready for
   * GIS layer creation or attachment.
   *
   * For unit-level predictions (one per admin region), we update the
   * existing draft layer for the hazard type rather than creating one per prediction.
   */
  @OnEvent('ml.prediction.approved')
  async onPredictionApproved(event: {
    predictionId: string;
    hazardType: string;
    adminCode: string;
    riskTier: string;
  }): Promise<void> {
    this.logger.debug(
      `ML prediction ${event.predictionId} approved for ${event.hazardType}/${event.adminCode} (tier: ${event.riskTier})`,
    );

    // Emit to notify communication domain of elevated risk (§16.3)
    if (event.riskTier === 'critical' || event.riskTier === 'high') {
      this.events.emit('alert.spatial_risk_elevated', {
        source: 'ml_prediction',
        predictionId: event.predictionId,
        hazardType: event.hazardType,
        administrativeCode: event.adminCode,
        riskTier: event.riskTier,
        triggeredAt: new Date().toISOString(),
      });

      this.logger.log(
        `Spatial risk alert emitted for ${event.hazardType} in ${event.adminCode} (tier: ${event.riskTier})`,
      );
    }
  }

  /**
   * Model drift alert — the production model has drifted significantly.
   * Emit a platform alert so the ML operations team is notified.
   */
  @OnEvent('ml.drift.alert')
  async onDriftAlert(event: {
    modelVersionId: string;
    maxPsi: number;
    driftSeverity: string;
    snapshotId: string;
  }): Promise<void> {
    this.logger.warn(
      `Model drift alert: version ${event.modelVersionId}, PSI=${event.maxPsi.toFixed(3)}, severity=${event.driftSeverity}`,
    );

    this.events.emit('alert.ml_model_drift', {
      modelVersionId: event.modelVersionId,
      maxPsi: event.maxPsi,
      driftSeverity: event.driftSeverity,
      snapshotId: event.snapshotId,
      triggeredAt: new Date().toISOString(),
    });
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────────

  private async createDraftRiskLayer(hazardType: string, batchId: string | null): Promise<void> {
    const now = new Date();
    const validUntil = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000); // 30 days

    const layerName = `AI Risk Layer — ${this.formatHazardType(hazardType)} — ${now.toISOString().slice(0, 10)}`;

    const layer = this.layerRepo.create({
      name: layerName,
      description: `Automatically generated ${hazardType} risk layer from ML prediction batch. Pending analyst review before publication.`,
      geometryType: GeometryType.POLYGON,
      srid: 4326,
      classification: 1, // Internal — analyst may upgrade at approval time
      ownerPositionId: GisMlListener.AI_OWNER_POSITION,
      updateCadence: UpdateCadence.DAILY,
      status: LayerStatus.DRAFT,
      qualityStatus: QualityStatus.NEEDS_REVIEW,
      keywords: ['ai', 'ml', 'risk', hazardType, 'prediction'],
      isAiGenerated: true,
      sourcePredictionId: batchId ?? null,
      aiHazardType: hazardType,
      aiGeneratedAt: now,
      predictionValidUntil: validUntil,
      createdById: GisMlListener.SYSTEM_ACTOR,
    });

    const saved = await this.layerRepo.save(layer);

    this.auditService.emit({
      action: 'gis.ai_layer.created',
      actorId: GisMlListener.SYSTEM_ACTOR,
      resourceType: 'SpatialLayer',
      resourceId: saved.id,
      metadata: {
        hazardType,
        batchId,
        status: 'draft',
        pendingReview: true,
      },
    });

    // Notify the analyst review queue
    this.events.emit('gis.ai_layer.pending_review', {
      layerId: saved.id,
      layerName: saved.name,
      hazardType,
      batchId,
      validUntil: validUntil.toISOString(),
    });

    this.logger.log(
      `Created draft AI risk layer ${saved.id} for hazard type "${hazardType}" (valid until ${validUntil.toISOString().slice(0, 10)})`,
    );
  }

  private formatHazardType(hazardType: string): string {
    return hazardType.charAt(0).toUpperCase() + hazardType.slice(1).replace(/_/g, ' ');
  }
}
