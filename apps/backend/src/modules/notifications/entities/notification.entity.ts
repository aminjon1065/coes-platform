import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

export enum NotificationPriority {
  LOW = 'low',
  NORMAL = 'normal',
  HIGH = 'high',
  CRITICAL = 'critical',
}

/**
 * 2.6.1 — In-app notification record.
 *
 * One row per recipient per event. Created by NotificationService when a
 * 'notification.requested' event is received. Persisted for inbox/history.
 */
@Entity({ schema: 'notifications', name: 'notifications' })
@Index(['recipientPositionId', 'isRead', 'createdAt'])
@Index(['recipientUserId', 'isRead', 'createdAt'])
export class Notification {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Notification category — matches the 'type' field on 'notification.requested' events */
  @Column({ length: 100 })
  type: string;

  /** The position this notification targets (authority-model: position, not user) */
  @Column('uuid', { name: 'recipient_position_id' })
  @Index()
  recipientPositionId: string;

  /**
   * Resolved user ID — populated if we can resolve the position occupant at
   * notification creation time. May be null for vacant positions.
   */
  @Column('uuid', { name: 'recipient_user_id', nullable: true })
  @Index()
  recipientUserId: string | null;

  @Column({ type: 'enum', enum: NotificationPriority, default: NotificationPriority.NORMAL })
  priority: NotificationPriority;

  @Column({ length: 255 })
  title: string;

  @Column({ type: 'text', nullable: true })
  body: string | null;

  /** Structured data for rendering the notification on the client */
  @Column({ type: 'jsonb', nullable: true })
  payload: Record<string, unknown> | null;

  /** Deep-link path: e.g. /tasks/uuid, /documents/uuid */
  @Column({ type: 'varchar',  length: 500, name: 'action_url', nullable: true })
  actionUrl: string | null;

  @Column({ name: 'is_read', default: false })
  isRead: boolean;

  @Column({ name: 'read_at', type: 'timestamptz', nullable: true })
  readAt: Date | null;

  /** When the notification auto-expires from inbox (null = never) */
  @Column({ name: 'expires_at', type: 'timestamptz', nullable: true })
  expiresAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
