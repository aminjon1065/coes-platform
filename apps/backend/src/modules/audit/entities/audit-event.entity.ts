import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  Index,
  CreateDateColumn,
} from 'typeorm';

export enum AuditSeverity {
  INFO = 'info',
  WARNING = 'warning',
  CRITICAL = 'critical',
}

/**
 * Append-only. NO UPDATE, NO DELETE operations are ever issued against this table.
 * The schema-level INSERT-only permission must be enforced at the database level.
 */
@Entity({ name: 'audit_events', schema: 'audit' })
@Index(['actorId', 'occurredAt'])
@Index(['eventType', 'occurredAt'])
@Index(['resourceType', 'resourceId'])
export class AuditEvent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // Who did it (null for system events)
  @Column({ name: 'actor_id', type: 'uuid', nullable: true })
  actorId: string | null;

  @Column({ type: 'varchar',  name: 'actor_username', length: 100, nullable: true })
  actorUsername: string | null;

  // What happened
  @Column({ name: 'event_type', length: 100 })
  eventType: string;

  // What it happened to
  @Column({ type: 'varchar',  name: 'resource_type', length: 100, nullable: true })
  resourceType: string | null;

  @Column({ name: 'resource_id', type: 'uuid', nullable: true })
  resourceId: string | null;

  // Context
  @Column({ type: 'varchar',  name: 'ip_address', length: 45, nullable: true })
  ipAddress: string | null;

  @Column({ type: 'varchar',  name: 'user_agent', length: 512, nullable: true })
  userAgent: string | null;

  // Outcome
  @Column({ default: true })
  success: boolean;

  @Column({ type: 'varchar',  name: 'failure_reason', length: 500, nullable: true })
  failureReason: string | null;

  @Column({
    type: 'enum',
    enum: AuditSeverity,
    enumName: 'audit_severity',
    default: AuditSeverity.INFO,
  })
  severity: AuditSeverity;

  // Arbitrary metadata (JSON), immutable after insert
  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, unknown> | null;

  // Chain-of-custody hash: sha256(prev_hash + id + event_type + actor_id + occurred_at)
  @Column({ type: 'varchar',  name: 'integrity_hash', length: 64, nullable: true })
  integrityHash: string | null;

  @CreateDateColumn({ name: 'occurred_at', type: 'timestamptz' })
  occurredAt: Date;
}
