import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

export enum TelegramSubscriptionStatus {
  ACTIVE = 'active',
  REVOKED = 'revoked',
  INVALID = 'invalid',
}

@Entity({ schema: 'notifications', name: 'telegram_subscriptions' })
@Index(['userId'], { unique: true })
@Index(['chatId'], { unique: true })
export class TelegramSubscription {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid', { name: 'user_id' })
  userId: string;

  @Column({ type: 'varchar', name: 'chat_id', length: 64 })
  chatId: string;

  @Column({ type: 'varchar', name: 'username', length: 255, nullable: true })
  username: string | null;

  @Column({ type: 'varchar', name: 'display_name', length: 255, nullable: true })
  displayName: string | null;

  @Column({
    type: 'enum',
    enum: TelegramSubscriptionStatus,
    enumName: 'telegram_subscription_status',
    default: TelegramSubscriptionStatus.ACTIVE,
  })
  status: TelegramSubscriptionStatus;

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
