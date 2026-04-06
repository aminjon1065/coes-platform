import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
  OneToMany,
} from 'typeorm';
import { IncidentResponse } from './incident-response.entity';
import { ResourceDeployment } from './resource-deployment.entity';

export enum IncidentStatus {
  OPEN       = 'open',
  RESPONDING = 'responding',
  CONTAINED  = 'contained',
  RESOLVED   = 'resolved',
  CLOSED     = 'closed',
  CANCELLED  = 'cancelled',
}

export enum IncidentSeverity {
  MINOR        = 'minor',
  MODERATE     = 'moderate',
  MAJOR        = 'major',
  CATASTROPHIC = 'catastrophic',
}

@Entity({ name: 'incidents', schema: 'analytics' })
@Index(['incidentType'])
@Index(['severity'])
@Index(['status'])
@Index(['administrativeCode'])
@Index(['reportedAt'])
export class Incident {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Shared key across GIS and Analytics domains */
  @Column({ name: 'incident_ref', length: 100, unique: true })
  incidentRef: string;

  @Column({ length: 300 })
  title: string;

  @Column({ name: 'incident_type', length: 100 })
  incidentType: string;

  @Column({
    type: 'enum',
    enum: IncidentSeverity,
    enumName: 'incident_severity',
    default: IncidentSeverity.MODERATE,
  })
  severity: IncidentSeverity;

  @Column({
    type: 'enum',
    enum: IncidentStatus,
    enumName: 'incident_status',
    default: IncidentStatus.OPEN,
  })
  status: IncidentStatus;

  @Column({ name: 'administrative_code', length: 20, nullable: true })
  administrativeCode: string | null;

  @Column({ name: 'administrative_name', length: 200, nullable: true })
  administrativeName: string | null;

  /** Denormalised from GIS domain for query convenience */
  @Column({ type: 'decimal', precision: 10, scale: 7, nullable: true })
  latitude: number | null;

  @Column({ type: 'decimal', precision: 10, scale: 7, nullable: true })
  longitude: number | null;

  @Column({ name: 'affected_area_km2', type: 'decimal', precision: 12, scale: 4, nullable: true })
  affectedAreaKm2: number | null;

  @Column({ name: 'affected_population', type: 'int', nullable: true })
  affectedPopulation: number | null;

  @Column({ name: 'casualties_confirmed', type: 'int', default: 0 })
  casualtiesConfirmed: number;

  @Column({ name: 'casualties_suspected', type: 'int', default: 0 })
  casualtiesSuspected: number;

  @Column({ name: 'infrastructure_damage', type: 'jsonb', default: '{}' })
  infrastructureDamage: object;

  @Column({ name: 'reported_at', type: 'timestamptz' })
  reportedAt: Date;

  @Column({ name: 'first_response_at', type: 'timestamptz', nullable: true })
  firstResponseAt: Date | null;

  @Column({ name: 'contained_at', type: 'timestamptz', nullable: true })
  containedAt: Date | null;

  @Column({ name: 'resolved_at', type: 'timestamptz', nullable: true })
  resolvedAt: Date | null;

  @Column({ name: 'closed_at', type: 'timestamptz', nullable: true })
  closedAt: Date | null;

  /**
   * response_time_minutes and resolution_time_hours are GENERATED columns.
   * TypeORM marks them as read-only by selecting them in raw queries.
   */

  /** 0=unrestricted 1=internal 2=confidential 3=secret */
  @Column({ type: 'smallint', default: 0 })
  classification: number;

  @Column({ name: 'responsible_dept_id', type: 'uuid', nullable: true })
  responsibleDeptId: string | null;

  @Column({ name: 'reported_by_id', type: 'uuid' })
  reportedById: string;

  @Column({ name: 'lead_responder_id', type: 'uuid', nullable: true })
  leadResponderId: string | null;

  @Column({ name: 'edms_document_ids', type: 'uuid', array: true, default: '{}' })
  edmsDocumentIds: string[];

  @Column({ name: 'task_ids', type: 'uuid', array: true, default: '{}' })
  taskIds: string[];

  @Column({ type: 'jsonb', default: '{}' })
  attributes: object;

  @Column({ name: 'internal_notes', type: 'text', nullable: true })
  internalNotes: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  @OneToMany(() => IncidentResponse, (r) => r.incident)
  responses: IncidentResponse[];

  @OneToMany(() => ResourceDeployment, (d) => d.incident)
  resourceDeployments: ResourceDeployment[];
}
