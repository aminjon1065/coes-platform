import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  Index,
} from 'typeorm';
import { AuditSeverity } from './audit-event.entity';

/**
 * Cold-storage table for audit events aged out of the hot audit_events table.
 * Identical structure to AuditEvent, but stored in audit.audit_archives.
 * Events are moved here by SiemExportService.archiveOldEvents() after 90 days.
 * Purged after 7 years by SiemExportService.purgeExpiredArchives().
 */
@Entity({ name: 'audit_archives', schema: 'audit' })
@Index(['actorId', 'occurredAt'])
@Index(['eventType', 'occurredAt'])
export class AuditArchive {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'original_id' })
  originalId: string;

  @Column({ type: 'varchar',  name: 'actor_id', nullable: true })
  actorId: string | null;

  @Column({ type: 'varchar',  name: 'actor_username', length: 100, nullable: true })
  actorUsername: string | null;

  @Column({ name: 'event_type', length: 100 })
  eventType: string;

  @Column({ type: 'varchar',  name: 'resource_type', length: 100, nullable: true })
  resourceType: string | null;

  @Column({ type: 'varchar',  name: 'resource_id', nullable: true })
  resourceId: string | null;

  @Column({ type: 'varchar',  name: 'ip_address', length: 45, nullable: true })
  ipAddress: string | null;

  @Column({ default: true })
  success: boolean;

  @Column({ type: 'varchar',  name: 'failure_reason', length: 500, nullable: true })
  failureReason: string | null;

  @Column({
    type: 'enum',
    enum: AuditSeverity,
    default: AuditSeverity.INFO,
  })
  severity: AuditSeverity;

  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, unknown> | null;

  @Column({ type: 'varchar',  name: 'integrity_hash', length: 64, nullable: true })
  integrityHash: string | null;

  @Column({ name: 'occurred_at', type: 'timestamptz' })
  occurredAt: Date;
}
