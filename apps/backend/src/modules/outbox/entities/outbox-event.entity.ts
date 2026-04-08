import {
  Column,
  CreateDateColumn,
  Entity,
  Generated,
  Index,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';

export type OutboxEventStatus =
  | 'pending'
  | 'dispatched'
  | 'failed'
  | 'dead_letter';

@Entity({ schema: 'public', name: 'outbox_events' })
@Index('idx_outbox_status_available', ['status', 'availableAt'])
@Index('idx_outbox_event_type_created', ['eventType', 'createdAt'])
export class OutboxEvent {
  @PrimaryColumn('uuid')
  @Generated('uuid')
  id: string;

  @Column({ name: 'event_type', type: 'varchar', length: 160 })
  eventType: string;

  @Column({ name: 'payload', type: 'jsonb' })
  payload: Record<string, unknown>;

  @Column({ name: 'status', type: 'varchar', length: 32, default: 'pending' })
  status: OutboxEventStatus;

  @Column({ name: 'source', type: 'varchar', length: 120, nullable: true })
  source: string | null;

  @Column({ name: 'aggregate_type', type: 'varchar', length: 120, nullable: true })
  aggregateType: string | null;

  @Column({ name: 'aggregate_id', type: 'uuid', nullable: true })
  aggregateId: string | null;

  @Column({ name: 'attempts', type: 'int', default: 0 })
  attempts: number;

  @Column({ name: 'max_attempts', type: 'int', default: 10 })
  maxAttempts: number;

  @Column({ name: 'available_at', type: 'timestamptz', default: () => 'NOW()' })
  availableAt: Date;

  @Column({ name: 'last_attempt_at', type: 'timestamptz', nullable: true })
  lastAttemptAt: Date | null;

  @Column({ name: 'dispatched_at', type: 'timestamptz', nullable: true })
  dispatchedAt: Date | null;

  @Column({ name: 'last_error', type: 'text', nullable: true })
  lastError: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
