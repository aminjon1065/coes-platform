import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

export enum DriftSeverity {
  NONE     = 'none',
  LOW      = 'low',
  MODERATE = 'moderate',
  HIGH     = 'high',
}

@Entity({ name: 'model_performance_snapshots', schema: 'ml' })
@Index(['modelVersionId', 'snapshotAt'])
export class ModelPerformanceSnapshot {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'model_version_id', type: 'uuid' })
  modelVersionId: string;

  /** Window of predictions assessed: [window_start, window_end) */
  @Column({ name: 'window_start', type: 'timestamptz' })
  windowStart: Date;

  @Column({ name: 'window_end', type: 'timestamptz' })
  windowEnd: Date;

  /** Number of predictions in the window */
  @Column({ name: 'prediction_count', type: 'int', default: 0 })
  predictionCount: number;

  /**
   * Ground-truth accuracy metrics (populated once actuals arrive).
   * null if not yet evaluated (predictions still in validity window).
   */
  @Column({ name: 'accuracy_metrics', type: 'jsonb', nullable: true })
  accuracyMetrics: {
    auc_roc?: number;
    f1?: number;
    precision?: number;
    recall?: number;
    rmse?: number;
    mae?: number;
  } | null;

  /**
   * Input feature drift vs. training distribution.
   * Computed by PSI (Population Stability Index) per feature.
   */
  @Column({ name: 'feature_drift', type: 'jsonb', default: '{}' })
  featureDrift: Record<string, number>;

  /** Max PSI across features — used for alerting threshold */
  @Column({ name: 'max_psi', type: 'numeric', precision: 8, scale: 4, nullable: true })
  maxPsi: number | null;

  @Column({
    name: 'drift_severity',
    type: 'enum',
    enum: DriftSeverity,
    enumName: 'drift_severity',
    default: DriftSeverity.NONE,
  })
  driftSeverity: DriftSeverity;

  /** Score distribution stats: mean, stddev, p5, p25, p50, p75, p95 */
  @Column({ name: 'score_distribution', type: 'jsonb', default: '{}' })
  scoreDistribution: object;

  /** True if an alert was triggered for this snapshot */
  @Column({ name: 'alert_triggered', default: false })
  alertTriggered: boolean;

  @Column({ name: 'alert_details', type: 'jsonb', nullable: true })
  alertDetails: object | null;

  @CreateDateColumn({ name: 'snapshot_at', type: 'timestamptz' })
  snapshotAt: Date;
}
