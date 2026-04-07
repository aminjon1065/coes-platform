import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from 'typeorm';

export enum OrgChangeType {
  DEPARTMENT_CREATED = 'department_created',
  DEPARTMENT_UPDATED = 'department_updated',
  DEPARTMENT_DEACTIVATED = 'department_deactivated',
  POSITION_CREATED = 'position_created',
  POSITION_UPDATED = 'position_updated',
  POSITION_DEACTIVATED = 'position_deactivated',
  REPORTING_LINE_CHANGED = 'reporting_line_changed',
}

/**
 * Append-only record of all organizational changes.
 * Provides a complete audit trail of the org structure over time.
 */
@Entity({ name: 'org_change_history', schema: 'org' })
export class OrgChangeHistory {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'enum', enum: OrgChangeType })
  changeType: OrgChangeType;

  @Column({ name: 'entity_type', length: 50 })
  entityType: string;

  @Column({ name: 'entity_id' })
  entityId: string;

  @Column({ type: 'varchar',  name: 'changed_by_id', nullable: true })
  changedById: string | null;

  @Column({ type: 'jsonb', nullable: true })
  before: Record<string, unknown> | null;

  @Column({ type: 'jsonb', nullable: true })
  after: Record<string, unknown> | null;

  @CreateDateColumn({ name: 'occurred_at', type: 'timestamptz' })
  occurredAt: Date;
}
