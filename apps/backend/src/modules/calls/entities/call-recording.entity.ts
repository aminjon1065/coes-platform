import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { CallSession } from './call-session.entity';

export enum RecordingStatus {
  RECORDING  = 'recording',
  STOPPED    = 'stopped',
  PROCESSING = 'processing',
  READY      = 'ready',
  FAILED     = 'failed',
  DELETED    = 'deleted',
}

@Entity({ schema: 'calls', name: 'call_recordings' })
export class CallRecording {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'session_id', type: 'uuid' })
  sessionId: string;

  @Column({
    type: 'enum',
    enum: RecordingStatus,
    enumName: 'recording_status',
    default: RecordingStatus.RECORDING,
  })
  status: RecordingStatus;

  @Column({ name: 'storage_key', type: 'varchar', length: 500, nullable: true })
  storageKey: string | null;

  @Column({ name: 'size_bytes', type: 'bigint', nullable: true })
  sizeBytes: string | null;

  @Column({ name: 'duration_seconds', type: 'int', nullable: true })
  durationSeconds: number | null;

  @Column({ type: 'smallint', default: 0 })
  classification: number;

  @Column({ name: 'started_at', type: 'timestamptz', default: () => 'now()' })
  startedAt: Date;

  @Column({ name: 'stopped_at', type: 'timestamptz', nullable: true })
  stoppedAt: Date | null;

  @Column({ name: 'expires_at', type: 'timestamptz', nullable: true })
  expiresAt: Date | null;

  @Column({ name: 'initiated_by_id', type: 'uuid' })
  initiatedById: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  @ManyToOne(() => CallSession, (s) => s.recordings, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'session_id' })
  session: CallSession;
}
