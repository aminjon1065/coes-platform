import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export type InboxMessageStatus = 'processing' | 'completed' | 'failed';

@Entity({ schema: 'public', name: 'inbox_messages' })
@Index('uq_inbox_messages_key', ['messageKey'], { unique: true })
export class InboxMessage {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'message_key', type: 'varchar', length: 255 })
  messageKey: string;

  @Column({ name: 'consumer', type: 'varchar', length: 120 })
  consumer: string;

  @Column({ name: 'event_type', type: 'varchar', length: 160 })
  eventType: string;

  @Column({ name: 'status', type: 'varchar', length: 32, default: 'processing' })
  status: InboxMessageStatus;

  @Column({ name: 'attempts', type: 'int', default: 0 })
  attempts: number;

  @Column({ name: 'payload_hash', type: 'varchar', length: 64 })
  payloadHash: string;

  @Column({ name: 'payload', type: 'jsonb', default: () => "'{}'" })
  payload: Record<string, unknown>;

  @Column({ name: 'last_error', type: 'text', nullable: true })
  lastError: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
