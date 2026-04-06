import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  type Relation,
} from 'typeorm';
import type { CallSession } from './call-session.entity';

export enum ParticipantStatus {
  INVITED  = 'invited',
  JOINED   = 'joined',
  LEFT     = 'left',
  REJECTED = 'rejected',
}

@Entity({ schema: 'calls', name: 'call_participants' })
export class CallParticipant {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'session_id', type: 'uuid' })
  sessionId: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @Column({ name: 'position_id', type: 'uuid', nullable: true })
  positionId: string | null;

  @Column({ name: 'display_name', type: 'varchar', length: 120 })
  displayName: string;

  @Column({
    type: 'enum',
    enum: ParticipantStatus,
    enumName: 'participant_status',
    default: ParticipantStatus.INVITED,
  })
  status: ParticipantStatus;

  @Column({ name: 'joined_at', type: 'timestamptz', nullable: true })
  joinedAt: Date | null;

  @Column({ name: 'left_at', type: 'timestamptz', nullable: true })
  leftAt: Date | null;

  @Column({ name: 'audio_muted', default: false })
  audioMuted: boolean;

  @Column({ name: 'video_muted', default: false })
  videoMuted: boolean;

  @Column({ name: 'is_moderator', default: false })
  isModerator: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @ManyToOne('CallSession', 'participants', { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'session_id' })
  session: Relation<CallSession>;
}
