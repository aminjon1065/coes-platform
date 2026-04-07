import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

export enum ReportType {
  INCIDENT_STATISTICAL  = 'incident_statistical',   // 5.4.1
  CROSS_DOMAIN          = 'cross_domain',            // 5.4.2
  RISK_FORECAST_SUMMARY = 'risk_forecast_summary',
  RESOURCE_UTILISATION  = 'resource_utilisation',
  RESPONSE_TIME_ANALYSIS = 'response_time_analysis',
  CUSTOM                = 'custom',
}

export enum ReportFormat {
  JSON = 'json',
  PDF  = 'pdf',
  CSV  = 'csv',
  XLSX = 'xlsx',
}

export enum ReportStatus {
  PENDING   = 'pending',
  RUNNING   = 'running',
  COMPLETE  = 'complete',
  FAILED    = 'failed',
}

export enum DeliveryChannel {
  DOWNLOAD   = 'download',
  EMAIL      = 'email',
  WEBHOOK    = 'webhook',
}

@Entity({ name: 'report_definitions', schema: 'reporting' })
@Index(['reportType'])
@Index(['isScheduled'])
export class ReportDefinition {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 200 })
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({
    name: 'report_type',
    type: 'enum',
    enum: ReportType,
    enumName: 'report_type',
  })
  reportType: ReportType;

  /** Jinja2-style query/template spec interpreted by the report engine */
  @Column({ name: 'query_spec', type: 'jsonb', default: '{}' })
  querySpec: object;

  @Column({
    name: 'default_format',
    type: 'enum',
    enum: ReportFormat,
    enumName: 'report_format',
    default: ReportFormat.JSON,
  })
  defaultFormat: ReportFormat;

  @Column({ name: 'is_scheduled', default: false })
  isScheduled: boolean;

  /** CRON expression (null if not scheduled) */
  @Column({ type: 'varchar',  name: 'cron_expression', length: 100, nullable: true })
  cronExpression: string | null;

  @Column({
    name: 'delivery_channel',
    type: 'enum',
    enum: DeliveryChannel,
    enumName: 'delivery_channel',
    default: DeliveryChannel.DOWNLOAD,
  })
  deliveryChannel: DeliveryChannel;

  /** Email recipients or webhook URL depending on delivery_channel */
  @Column({ name: 'delivery_config', type: 'jsonb', default: '{}' })
  deliveryConfig: object;

  /** 0=unrestricted 1=internal 2=confidential 3=secret */
  @Column({ type: 'smallint', default: 1 })
  classification: number;

  @Column({ name: 'owner_id', type: 'uuid' })
  ownerId: string;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
