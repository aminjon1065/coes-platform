import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
  type Relation,
} from 'typeorm';
import type { CallParticipant } from './call-participant.entity';
import type { CallRecording } from './call-recording.entity';

export enum CallStatus {
  SCHEDULED = 'scheduled',
  ACTIVE    = 'active',
  ENDED     = 'ended',
  CANCELLED = 'cancelled',
}

@Entity({ schema: 'calls', name: 'call_sessions' })
export class CallSession {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'channel_id', type: 'uuid' })
  channelId: string;

  @Column({ name: 'initiated_by_id', type: 'uuid' })
  initiatedById: string;

  @Column({ type: 'enum', enum: CallStatus, enumName: 'call_status', default: CallStatus.ACTIVE })
  status: CallStatus;

  @Column({ type: 'smallint', default: 0 })
  classification: number;

  @Column({ name: 'scheduled_start', type: 'timestamptz', nullable: true })
  scheduledStart: Date | null;

  @Column({ name: 'actual_start', type: 'timestamptz', default: () => 'now()' })
  actualStart: Date;

  @Column({ name: 'ended_at', type: 'timestamptz', nullable: true })
  endedAt: Date | null;

  @Column({ type: 'varchar', length: 200, nullable: true })
  title: string | null;

  @Column({ name: 'max_participants', type: 'smallint', default: 50 })
  maxParticipants: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  @OneToMany('CallParticipant', 'session')
  participants: Relation<CallParticipant[]>;

  @OneToMany('CallRecording', 'session')
  recordings: Relation<CallRecording[]>;
}
