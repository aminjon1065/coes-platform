import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
  OneToMany,
} from 'typeorm';
import { MessageEdit } from './message-edit.entity';

export enum MessageType {
  TEXT = 'text',
  SYSTEM = 'system',       // Platform-generated (task created, document routed, etc.)
  FILE = 'file',           // Primary content is a file attachment
  EMERGENCY = 'emergency', // Emergency broadcast — visually distinct
}

@Entity({ name: 'messages', schema: 'chat' })
@Index(['channelId', 'sequence'])
@Index(['channelId', 'createdAt'])
@Index(['parentMessageId'], { where: 'parent_message_id IS NOT NULL' })
export class Message {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'channel_id' })
  channelId: string;

  /**
   * Client-supplied idempotency key — prevents duplicate send on retry.
   * Stored with a TTL-based uniqueness window.
   */
  @Column({ name: 'idempotency_key', type: 'varchar', nullable: true })
  @Index({ unique: true, where: 'idempotency_key IS NOT NULL' })
  idempotencyKey: string | null;

  /** Per-channel monotonically increasing sequence number */
  @Column({ name: 'sequence' })
  sequence: number;

  @Column({
    type: 'enum',
    enum: MessageType,
    default: MessageType.TEXT,
  })
  type: MessageType;

  /** Sender user (credential) ID */
  @Column({ name: 'sender_id' })
  senderId: string;

  /** Position the sender occupied at send time */
  @Column({ type: 'varchar',  name: 'sender_position_id', nullable: true })
  senderPositionId: string | null;

  /** Message body (plain text / markdown) */
  @Column({ type: 'text', nullable: true })
  body: string | null;

  /**
   * File attachments: array of { fileId, fileName, mimeType, fileSizeBytes, classification }
   * References to FileManagement domain — no file bytes stored here.
   */
  @Column({ type: 'jsonb', default: '[]' })
  attachments: Array<{
    fileId: string;
    fileName: string;
    mimeType?: string;
    fileSizeBytes?: number;
    classification: number;
  }>;

  /**
   * For SYSTEM messages: structured data card.
   * { eventType, entityId, entityType, summary, ... }
   */
  @Column({ name: 'system_payload', type: 'jsonb', nullable: true })
  systemPayload: Record<string, unknown> | null;

  // ─── Threading (shallow — no nested threads) ─────────────────────────────────

  @Column({ type: 'varchar',  name: 'parent_message_id', nullable: true })
  parentMessageId: string | null;

  /** Count of direct replies (for display without loading replies) */
  @Column({ name: 'reply_count', default: 0 })
  replyCount: number;

  // ─── Classification ──────────────────────────────────────────────────────────

  /** Inherits channel classification by default; sender may elevate */
  @Column({ name: 'classification', default: 1 })
  classification: number;

  // ─── Edit / deletion ─────────────────────────────────────────────────────────

  @Column({ name: 'is_edited', default: false })
  isEdited: boolean;

  @Column({ name: 'edited_at', type: 'timestamptz', nullable: true })
  editedAt: Date | null;

  /** Soft-delete: content replaced with null, flag set */
  @Column({ name: 'is_deleted', default: false })
  isDeleted: boolean;

  @Column({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt: Date | null;

  @Column({ type: 'varchar',  name: 'deleted_by_id', nullable: true })
  deletedById: string | null;

  @OneToMany(() => MessageEdit, (e) => e.messageId, { cascade: true })
  edits: MessageEdit[];

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
