import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
  ManyToOne,
  JoinColumn,
  type Relation,
} from 'typeorm';
import type { Incident } from './incident.entity';

export enum ResponseAction {
  DISPATCHED            = 'dispatched',
  ON_SCENE              = 'on_scene',
  EVACUATED             = 'evacuated',
  CONTAINED             = 'contained',
  REMEDIATED            = 'remediated',
  ASSESSMENT_COMPLETED  = 'assessment_completed',
  REPORT_FILED          = 'report_filed',
  RESOURCES_RELEASED    = 'resources_released',
}

@Entity({ name: 'incident_responses', schema: 'analytics' })
@Index(['incidentId'])
@Index(['occurredAt'])
export class IncidentResponse {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'incident_id', type: 'uuid' })
  incidentId: string;

  @ManyToOne('Incident', 'responses', { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'incident_id' })
  incident: Relation<Incident>;

  @Column({
    type: 'enum',
    enum: ResponseAction,
    enumName: 'response_action',
  })
  action: ResponseAction;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ type: 'varchar',  name: 'location_note', length: 300, nullable: true })
  locationNote: string | null;

  @Column({ name: 'occurred_at', type: 'timestamptz', default: () => 'now()' })
  occurredAt: Date;

  @Column({ name: 'recorded_by_id', type: 'uuid' })
  recordedById: string;

  /** [{type, count, unit}] */
  @Column({ name: 'resources_used', type: 'jsonb', default: '[]' })
  resourcesUsed: object[];

  @Column({ type: 'varchar',  length: 500, nullable: true })
  outcome: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
