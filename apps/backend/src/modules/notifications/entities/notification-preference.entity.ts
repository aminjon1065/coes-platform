import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

import { NotificationPriority } from './notification.entity';

/**
 * 2.6.5 — Per-user, per-notification-type delivery channel preferences.
 *
 * A row with notificationType = NULL acts as the user-level default.
 * A row with notificationType = 'TASK_OVERDUE_ESCALATION' overrides that default
 * for that specific type. Resolution order: specific > default > hardcoded fallback.
 */
@Entity({ schema: 'notifications', name: 'notification_preferences' })
@Index(['userId', 'notificationType'], { unique: true })
export class NotificationPreference {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid', { name: 'user_id' })
  @Index()
  userId: string;

  /**
   * Null = default preference (applies to all notification types unless overridden).
   * Non-null = override for a specific notification type.
   */
  @Column({ type: 'varchar',  name: 'notification_type', length: 100, nullable: true })
  notificationType: string | null;

  /** Deliver as in-app notification (persisted in DB, shown in inbox) */
  @Column({ name: 'in_app', default: true })
  inApp: boolean;

  /** Send email */
  @Column({ name: 'email', default: true })
  email: boolean;

  /** Send SMS — off by default (costly, high signal) */
  @Column({ name: 'sms', default: false })
  sms: boolean;

  /** Send Telegram bot notification to the user's linked chat. */
  @Column({ name: 'telegram', default: false })
  telegram: boolean;

  /** Send Web Push to active field-device subscriptions. */
  @Column({ name: 'push', default: true })
  push: boolean;

  /**
   * Throttle email delivery: minimum minutes between emails of the same type.
   * 0 = no throttle (immediate).
   */
  @Column({ name: 'email_throttle_minutes', default: 0 })
  emailThrottleMinutes: number;

  /**
   * Minimum priority required for SMS delivery.
   * E.g. setting HIGH means only HIGH + CRITICAL trigger SMS.
   */
  @Column({
    name: 'sms_min_priority',
    type: 'enum',
    enum: NotificationPriority,
    default: NotificationPriority.HIGH,
  })
  smsMinPriority: NotificationPriority;

  /**
   * Minimum priority required for Telegram delivery.
   * E.g. HIGH means only HIGH + CRITICAL trigger Telegram.
   */
  @Column({
    name: 'telegram_min_priority',
    type: 'enum',
    enum: NotificationPriority,
    default: NotificationPriority.HIGH,
  })
  telegramMinPriority: NotificationPriority;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
