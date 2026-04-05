import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Notification } from './notification.entity';

export enum DeliveryChannel {
  IN_APP = 'in_app',
  EMAIL = 'email',
  SMS = 'sms',
}

export enum DeliveryStatus {
  PENDING = 'pending',
  SENT = 'sent',
  FAILED = 'failed',
  SKIPPED = 'skipped',   // Skipped due to preference/throttle
}

/**
 * 2.6.7 — Per-channel delivery tracking.
 *
 * One row per (notification × channel). Allows retry logic and delivery
 * confirmation reporting without touching the parent Notification record.
 */
@Entity({ schema: 'notifications', name: 'notification_deliveries' })
@Index(['notificationId', 'channel'])
@Index(['status', 'channel', 'lastAttemptAt'])
export class NotificationDelivery {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid', { name: 'notification_id' })
  notificationId: string;

  @ManyToOne(() => Notification, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'notification_id' })
  notification: Notification;

  @Column({ type: 'enum', enum: DeliveryChannel })
  channel: DeliveryChannel;

  @Column({ type: 'enum', enum: DeliveryStatus, default: DeliveryStatus.PENDING })
  status: DeliveryStatus;

  /** Number of dispatch attempts (including the current one) */
  @Column({ default: 0 })
  attempts: number;

  @Column({ name: 'last_attempt_at', type: 'timestamptz', nullable: true })
  lastAttemptAt: Date | null;

  @Column({ name: 'sent_at', type: 'timestamptz', nullable: true })
  sentAt: Date | null;

  /** Error message from last failed attempt */
  @Column({ type: 'text', nullable: true })
  error: string | null;

  /**
   * External provider message ID (for email/SMS providers that return one).
   * Used for delivery confirmation webhooks.
   */
  @Column({ name: 'provider_message_id', length: 255, nullable: true })
  providerMessageId: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
