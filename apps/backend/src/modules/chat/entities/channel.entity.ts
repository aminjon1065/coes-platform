import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
  OneToMany,
} from 'typeorm';
import { ChannelMember } from './channel-member.entity';

export enum ChannelType {
  DIRECT = 'direct',                 // 1-to-1, implicitly created
  GROUP = 'group',                   // Named, explicitly managed membership
  DEPARTMENT = 'department',         // Auto-created per department, membership from org positions
  TASK_LINKED = 'task_linked',       // Auto-created per task, membership from task participants
  DOCUMENT_LINKED = 'document_linked', // Auto-created per EDMS document, membership from workflow
  EMERGENCY_BROADCAST = 'emergency_broadcast', // Write-restricted, read-all
  SYSTEM_NOTIFICATION = 'system_notification', // Read-only per-user, platform-generated
}

export enum ChannelStatus {
  ACTIVE = 'active',
  READ_ONLY = 'read_only',   // Task closed / document archived
  ARCHIVED = 'archived',
}

@Entity({ name: 'channels', schema: 'chat' })
@Index(['type', 'status'])
@Index(['linkedEntityId', 'linkedEntityType'], { where: "linked_entity_id IS NOT NULL" })
export class Channel {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 300, nullable: true })
  name: string | null;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({
    type: 'enum',
    enum: ChannelType,
  })
  type: ChannelType;

  @Column({
    type: 'enum',
    enum: ChannelStatus,
    default: ChannelStatus.ACTIVE,
  })
  status: ChannelStatus;

  /** 0=public 1=internal 2=confidential 3=secret */
  @Column({ name: 'classification', default: 1 })
  classification: number;

  /** Creator position (null for system-created channels) */
  @Column({ name: 'created_by_position_id', nullable: true })
  createdByPositionId: string | null;

  @Column({ name: 'created_by_id', nullable: true })
  createdById: string | null;

  // ─── Linked entity (task, document, department) ──────────────────────────────

  /** ID of the task / document / department this channel is linked to */
  @Column({ name: 'linked_entity_id', nullable: true })
  linkedEntityId: string | null;

  /** 'task' | 'document' | 'department' */
  @Column({ name: 'linked_entity_type', length: 50, nullable: true })
  linkedEntityType: string | null;

  // ─── Message sequencing ──────────────────────────────────────────────────────

  /** Monotonically increasing sequence counter; incremented per message send */
  @Column({ name: 'last_sequence', default: 0 })
  lastSequence: number;

  // ─── Retention policy ────────────────────────────────────────────────────────

  /** Days to retain messages (null = indefinite) */
  @Column({ name: 'retention_days', nullable: true })
  retentionDays: number | null;

  /** Whether this channel is under a legal hold (deletion blocked) */
  @Column({ name: 'legal_hold', default: false })
  legalHold: boolean;

  @OneToMany(() => ChannelMember, (m) => m.channel, { cascade: true })
  members: ChannelMember[];

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
