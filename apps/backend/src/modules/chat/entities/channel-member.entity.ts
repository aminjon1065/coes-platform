import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
  type Relation,
} from 'typeorm';
import type { Channel } from './channel.entity';

export enum MemberRole {
  OWNER = 'owner',     // Can manage the channel
  MEMBER = 'member',   // Regular participant
  OBSERVER = 'observer', // Read-only (e.g., supervisor oversight)
}

export enum MemberStatus {
  ACTIVE = 'active',
  REMOVED = 'removed',
  LEFT = 'left',
}

/**
 * A position's membership in a channel.
 * Membership targets positions — the current occupant is the effective member.
 * For DIRECT channels: exactly 2 members, immutable.
 * For DEPARTMENT/TASK_LINKED: auto-managed by platform.
 */
@Entity({ name: 'channel_members', schema: 'chat' })
@Index(['channelId', 'positionId'], { unique: true, where: "status = 'active'" })
@Index(['positionId', 'status'])
export class ChannelMember {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'channel_id' })
  channelId: string;

  @ManyToOne('Channel', 'members', { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'channel_id' })
  channel: Relation<Channel>;

  /** Position that is a member (occupant resolved at query time) */
  @Column({ name: 'position_id' })
  positionId: string;

  /** Snapshot of user at join time (for display purposes) */
  @Column({ name: 'user_id', nullable: true })
  userId: string | null;

  @Column({
    type: 'enum',
    enum: MemberRole,
    default: MemberRole.MEMBER,
  })
  role: MemberRole;

  @Column({
    type: 'enum',
    enum: MemberStatus,
    default: MemberStatus.ACTIVE,
  })
  status: MemberStatus;

  /** How membership was established: 'explicit', 'org_derived', 'task_derived', 'system' */
  @Column({ name: 'join_source', length: 50, default: 'explicit' })
  joinSource: string;

  /** Notifications muted until this time (null = not muted) */
  @Column({ name: 'muted_until', type: 'timestamptz', nullable: true })
  mutedUntil: Date | null;

  /**
   * Last-read sequence number for this member in this channel.
   * All messages with sequence <= lastReadSequence are considered read.
   */
  @Column({ name: 'last_read_sequence', default: 0 })
  lastReadSequence: number;

  @Column({ name: 'removed_at', type: 'timestamptz', nullable: true })
  removedAt: Date | null;

  @Column({ name: 'removed_by_id', nullable: true })
  removedById: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
