import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
  ManyToOne,
  JoinColumn,
  OneToMany,
} from 'typeorm';
import { MlModel } from './ml-model.entity';
import { RiskPrediction } from './risk-prediction.entity';

export enum ModelVersionStatus {
  TRAINING   = 'training',
  STAGING    = 'staging',
  PRODUCTION = 'production',
  ARCHIVED   = 'archived',
  FAILED     = 'failed',
}

@Entity({ name: 'ml_model_versions', schema: 'ml' })
@Index(['modelId', 'status'])
@Index(['mlflowRunId'], { unique: true, where: 'mlflow_run_id IS NOT NULL' })
export class MlModelVersion {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'model_id', type: 'uuid' })
  modelId: string;

  /** Semantic version string: "1.0.0", "2.1.3" */
  @Column({ length: 30 })
  version: string;

  @Column({
    type: 'enum',
    enum: ModelVersionStatus,
    enumName: 'model_version_status',
    default: ModelVersionStatus.TRAINING,
  })
  status: ModelVersionStatus;

  /** MLflow run ID — null until training completes */
  @Column({ name: 'mlflow_run_id', length: 64, nullable: true })
  mlflowRunId: string | null;

  /** MLflow registered model version number */
  @Column({ name: 'mlflow_version', nullable: true })
  mlflowVersion: number | null;

  /** S3/MinIO URI of the serialised model artefact */
  @Column({ name: 'artifact_uri', length: 500, nullable: true })
  artifactUri: string | null;

  /** Training dataset summary (row count, date range, feature hash) */
  @Column({ name: 'training_dataset_meta', type: 'jsonb', default: '{}' })
  trainingDatasetMeta: object;

  /** Hyperparameters logged during training */
  @Column({ type: 'jsonb', default: '{}' })
  hyperparameters: object;

  /** Evaluation metrics: AUC-ROC, F1, precision, recall, RMSE, etc. */
  @Column({ name: 'eval_metrics', type: 'jsonb', default: '{}' })
  evalMetrics: object;

  /** Feature importance map: { feature_name: importance_score } */
  @Column({ name: 'feature_importances', type: 'jsonb', default: '{}' })
  featureImportances: object;

  /** Human reviewer who approved/rejected the promotion to production */
  @Column({ name: 'reviewed_by_id', type: 'uuid', nullable: true })
  reviewedById: string | null;

  @Column({ name: 'reviewed_at', type: 'timestamptz', nullable: true })
  reviewedAt: Date | null;

  @Column({ name: 'review_notes', type: 'text', nullable: true })
  reviewNotes: string | null;

  @Column({ name: 'promoted_to_production_at', type: 'timestamptz', nullable: true })
  promotedToProductionAt: Date | null;

  @Column({ name: 'archived_at', type: 'timestamptz', nullable: true })
  archivedAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  @ManyToOne(() => MlModel, (m) => m.versions)
  @JoinColumn({ name: 'model_id' })
  model: MlModel;

  @OneToMany(() => RiskPrediction, (p) => p.modelVersion)
  predictions: RiskPrediction[];
}
