import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { HazardType } from './ml-model.entity';
import { MlModelVersion } from './ml-model-version.entity';

export enum PredictionStatus {
  PENDING   = 'pending',
  APPROVED  = 'approved',   // analyst reviewed and accepted
  REJECTED  = 'rejected',   // analyst reviewed and rejected
  PUBLISHED = 'published',  // pushed to GIS layer
  EXPIRED   = 'expired',    // TTL elapsed, superseded by newer prediction
}

@Entity({ name: 'risk_predictions', schema: 'ml' })
@Index(['hazardType', 'status'])
@Index(['administrativeCode'])
@Index(['predictedAt'])
@Index(['modelVersionId'])
export class RiskPrediction {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'model_version_id', type: 'uuid' })
  modelVersionId: string;

  @Column({
    name: 'hazard_type',
    type: 'enum',
    enum: HazardType,
    enumName: 'hazard_type',
  })
  hazardType: HazardType;

  /** Admin unit the prediction covers (matches GIS administrative_code) */
  @Column({ name: 'administrative_code', length: 20 })
  administrativeCode: string;

  @Column({ name: 'administrative_name', length: 200, nullable: true })
  administrativeName: string | null;

  /** Risk score: 0.0 (negligible) → 1.0 (extreme) */
  @Column({ name: 'risk_score', type: 'numeric', precision: 6, scale: 4 })
  riskScore: number;

  /** Integer tier: 1=Low 2=Medium 3=High 4=Critical */
  @Column({ name: 'risk_tier', type: 'smallint' })
  riskTier: number;

  /** Top-N feature contributions (SHAP values) */
  @Column({ name: 'shap_values', type: 'jsonb', default: '{}' })
  shapValues: object;

  /** Input feature snapshot used to generate this prediction */
  @Column({ name: 'input_features', type: 'jsonb', default: '{}' })
  inputFeatures: object;

  /** Prediction confidence interval [lower, upper] */
  @Column({ name: 'confidence_interval', type: 'jsonb', nullable: true })
  confidenceInterval: [number, number] | null;

  /** Validity window for this prediction */
  @Column({ name: 'valid_from', type: 'timestamptz' })
  validFrom: Date;

  @Column({ name: 'valid_until', type: 'timestamptz' })
  validUntil: Date;

  @Column({
    type: 'enum',
    enum: PredictionStatus,
    enumName: 'prediction_status',
    default: PredictionStatus.PENDING,
  })
  status: PredictionStatus;

  /** HITL: who reviewed this prediction */
  @Column({ name: 'reviewed_by_id', type: 'uuid', nullable: true })
  reviewedById: string | null;

  @Column({ name: 'reviewed_at', type: 'timestamptz', nullable: true })
  reviewedAt: Date | null;

  @Column({ name: 'review_notes', type: 'text', nullable: true })
  reviewNotes: string | null;

  /** 0=unrestricted 1=internal 2=confidential 3=secret */
  @Column({ type: 'smallint', default: 1 })
  classification: number;

  @CreateDateColumn({ name: 'predicted_at', type: 'timestamptz' })
  predictedAt: Date;

  @ManyToOne(() => MlModelVersion, (v) => v.predictions)
  @JoinColumn({ name: 'model_version_id' })
  modelVersion: MlModelVersion;
}
