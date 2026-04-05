import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { UserProfile } from './user-profile.entity';

export enum AssignmentType {
  PRIMARY = 'primary',       // main position
  ACTING = 'acting',         // temporarily filling a vacancy
  CONCURRENT = 'concurrent', // additional position held simultaneously
}

/**
 * Links a UserProfile to an org Position.
 * A user can hold multiple positions (e.g. acting + primary).
 * Only one PRIMARY assignment per user should be active at a time —
 * enforced at service layer.
 * Records are never deleted — vacating sets vacated_at.
 */
@Entity({ name: 'user_position_assignments', schema: 'users' })
@Index(['userId', 'positionId', 'vacatedAt'])
@Index(['positionId', 'vacatedAt']) // fast occupant lookup
export class UserPositionAssignment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id' })
  userId: string;

  @ManyToOne(() => UserProfile, (u) => u.positionAssignments, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: UserProfile;

  /** Position UUID — not a FK (cross-schema); validated at service layer */
  @Column({ name: 'position_id' })
  positionId: string;

  @Column({
    type: 'enum',
    enum: AssignmentType,
    default: AssignmentType.PRIMARY,
  })
  type: AssignmentType;

  @Column({ name: 'assigned_at', type: 'timestamptz' })
  assignedAt: Date;

  @Column({ name: 'vacated_at', type: 'timestamptz', nullable: true })
  vacatedAt: Date | null;

  @Column({ name: 'assigned_by_id', nullable: true })
  assignedById: string | null;

  @Column({ name: 'vacated_by_id', nullable: true })
  vacatedById: string | null;

  @Column({ length: 500, nullable: true })
  notes: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  get isActive(): boolean {
    return this.vacatedAt === null;
  }
}
