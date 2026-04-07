import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

export enum PushSubscriptionStatus {
  ACTIVE = 'active',
  EXPIRED = 'expired',
  INVALID = 'invalid',
}

@Entity({ schema: 'notifications', name: 'push_subscriptions' })
@Index(['userId', 'status'])
@Index(['endpoint'], { unique: true })
export class PushSubscription {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid', { name: 'user_id' })
  userId: string;

  @Column({ type: 'text' })
  endpoint: string;

  @Column({ name: 'p256dh_key', length: 255 })
  p256dhKey: string;

  @Column({ name: 'auth_key', length: 255 })
  authKey: string;

  @Column({ name: 'expiration_time', type: 'timestamptz', nullable: true })
  expirationTime: Date | null;

  @Column({ type: 'varchar',  name: 'user_agent', length: 512, nullable: true })
  userAgent: string | null;

  @Column({
    type: 'enum',
    enum: PushSubscriptionStatus,
    enumName: 'push_subscription_status',
    default: PushSubscriptionStatus.ACTIVE,
  })
  status: PushSubscriptionStatus;

  @Column({ name: 'failure_count', default: 0 })
  failureCount: number;

  @Column({ name: 'last_success_at', type: 'timestamptz', nullable: true })
  lastSuccessAt: Date | null;

  @Column({ name: 'last_failure_at', type: 'timestamptz', nullable: true })
  lastFailureAt: Date | null;

  @Column({ name: 'last_failure_reason', type: 'text', nullable: true })
  lastFailureReason: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
