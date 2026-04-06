import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { ReportFormat, ReportStatus, DeliveryChannel } from './report-definition.entity';

@Entity({ name: 'report_executions', schema: 'reporting' })
@Index(['definitionId', 'createdAt'])
@Index(['status'])
@Index(['triggeredById'])
export class ReportExecution {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'definition_id', type: 'uuid' })
  definitionId: string;

  @Column({
    type: 'enum',
    enum: ReportStatus,
    enumName: 'report_status',
    default: ReportStatus.PENDING,
  })
  status: ReportStatus;

  /** Parameter overrides supplied at trigger time */
  @Column({ name: 'parameters', type: 'jsonb', default: '{}' })
  parameters: object;

  @Column({
    type: 'enum',
    enum: ReportFormat,
    enumName: 'report_format',
    default: ReportFormat.JSON,
  })
  format: ReportFormat;

  /** MinIO object key where the rendered report is stored */
  @Column({ name: 'artifact_key', length: 500, nullable: true })
  artifactKey: string | null;

  /** Signed download URL (pre-signed S3 URL, 1h TTL) */
  @Column({ name: 'download_url', length: 1000, nullable: true })
  downloadUrl: string | null;

  /** Inline JSON payload for small JSON reports (< 1 MB) */
  @Column({ name: 'inline_result', type: 'jsonb', nullable: true })
  inlineResult: object | null;

  @Column({ name: 'row_count', nullable: true })
  rowCount: number | null;

  @Column({ name: 'file_size_bytes', type: 'bigint', nullable: true })
  fileSizeBytes: number | null;

  @Column({ name: 'started_at', type: 'timestamptz', nullable: true })
  startedAt: Date | null;

  @Column({ name: 'completed_at', type: 'timestamptz', nullable: true })
  completedAt: Date | null;

  @Column({ name: 'duration_ms', nullable: true })
  durationMs: number | null;

  @Column({ name: 'error_message', type: 'text', nullable: true })
  errorMessage: string | null;

  @Column({ name: 'triggered_by_id', type: 'uuid', nullable: true })
  triggeredById: string | null;

  /** 'manual' | 'scheduled' | 'event' */
  @Column({ name: 'trigger_source', length: 30, default: 'manual' })
  triggerSource: string;

  @Column({
    name: 'delivery_channel',
    type: 'enum',
    enum: DeliveryChannel,
    enumName: 'delivery_channel',
    default: DeliveryChannel.DOWNLOAD,
  })
  deliveryChannel: DeliveryChannel;

  @Column({ name: 'delivered_at', type: 'timestamptz', nullable: true })
  deliveredAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
