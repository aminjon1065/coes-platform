import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

/**
 * Per-message delivery receipt for DM (DIRECT) channels.
 *
 * For group channels the last_read_sequence on ChannelMember is sufficient.
 * For 2-party DM channels we additionally track individual message delivery
 * so the sender can show "delivered" / "read" double-check marks similar to
 * secure messaging apps (§4.6 of Chat-AudioVideo-Realtime-Architecture.md).
 *
 * A row is created when the message is first delivered to the recipient's
 * WebSocket connection, and `readAt` is set when they send a read_receipt.
 */
@Entity({ name: 'message_deliveries', schema: 'chat' })
@Index(['messageId', 'recipientUserId'], { unique: true })
@Index(['channelId', 'recipientUserId'])
export class MessageDelivery {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** References chat.messages.id */
  @Column({ name: 'message_id', type: 'uuid' })
  messageId: string;

  /** References chat.channels.id — denormalised for bulk unread queries */
  @Column({ name: 'channel_id', type: 'uuid' })
  channelId: string;

  /** The user who should receive the message */
  @Column({ name: 'recipient_user_id' })
  recipientUserId: string;

  /**
   * Timestamp when the message was delivered to at least one of the
   * recipient's active WebSocket connections.  NULL means the message has
   * not yet been delivered (recipient is offline; delivery pending).
   */
  @Column({ name: 'delivered_at', type: 'timestamptz', nullable: true })
  deliveredAt: Date | null;

  /**
   * Timestamp when the recipient acknowledged reading the message via a
   * `read_receipt` WebSocket event.  NULL means unread.
   */
  @Column({ name: 'read_at', type: 'timestamptz', nullable: true })
  readAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
