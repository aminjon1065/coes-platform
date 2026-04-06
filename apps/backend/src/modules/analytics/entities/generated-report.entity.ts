import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

export enum ReportFormat {
  JSON = 'json',
  CSV  = 'csv',
  PDF  = 'pdf',
  XLSX = 'xlsx',
}

@Entity({ name: 'generated_reports', schema: 'analytics' })
@Index(['reportType'])
@Index(['requestedById'])
@Index(['createdAt'])
export class GeneratedReport {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 300 })
  title: string;

  @Column({ name: 'report_type', length: 100 })
  reportType: string;

  @Column({ type: 'jsonb', default: '{}' })
  parameters: object;

  @Column({
    type: 'enum',
    enum: ReportFormat,
    enumName: 'report_format',
    default: ReportFormat.JSON,
  })
  format: ReportFormat;

  @Column({ name: 'period_from', type: 'timestamptz', nullable: true })
  periodFrom: Date | null;

  @Column({ name: 'period_to', type: 'timestamptz', nullable: true })
  periodTo: Date | null;

  /** MinIO object key — set when report is ready */
  @Column({ name: 'storage_key', length: 500, nullable: true })
  storageKey: string | null;

  @Column({ name: 'row_count', type: 'int', nullable: true })
  rowCount: number | null;

  @Column({ name: 'file_size_bytes', type: 'bigint', nullable: true })
  fileSizeBytes: number | null;

  @Column({ length: 20, default: 'generating' })
  status: string;

  @Column({ name: 'error_message', type: 'text', nullable: true })
  errorMessage: string | null;

  /** 0=unrestricted 1=internal 2=confidential 3=secret */
  @Column({ type: 'smallint', default: 0 })
  classification: number;

  @Column({ name: 'requested_by_id', type: 'uuid' })
  requestedById: string;

  @Column({ name: 'generated_at', type: 'timestamptz', nullable: true })
  generatedAt: Date | null;

  @Column({ name: 'expires_at', type: 'timestamptz', nullable: true })
  expiresAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
