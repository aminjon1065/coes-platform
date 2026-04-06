import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
  OneToMany,
  OneToOne,
  type Relation,
} from 'typeorm';
import type { UserPositionAssignment } from './user-position-assignment.entity';
import type { UserPreferences } from './user-preferences.entity';

export enum UserStatus {
  ACTIVE = 'active',
  ON_LEAVE = 'on_leave',
  SUSPENDED = 'suspended',
  OFFBOARDED = 'offboarded',
}

@Entity({ name: 'user_profiles', schema: 'users' })
export class UserProfile {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Links to iam.user_credentials — one-to-one, not a FK constraint
   *  (schemas are separate; integrity enforced at service layer) */
  @Index({ unique: true })
  @Column({ name: 'credential_id' })
  credentialId: string;

  @Column({ name: 'first_name', length: 100 })
  firstName: string;

  @Column({ name: 'last_name', length: 100 })
  lastName: string;

  @Column({ name: 'middle_name', length: 100, nullable: true })
  middleName: string | null;

  /** Display name shown in the UI — derived from name fields if not set */
  @Column({ name: 'display_name', length: 255, nullable: true })
  displayName: string | null;

  @Index({ unique: true })
  @Column({ length: 255 })
  email: string;

  @Column({ name: 'phone', length: 30, nullable: true })
  phone: string | null;

  @Column({ name: 'avatar_url', length: 512, nullable: true })
  avatarUrl: string | null;

  @Column({
    type: 'enum',
    enum: UserStatus,
    default: UserStatus.ACTIVE,
  })
  status: UserStatus;

  /** Clearance level: 0=public, 1=internal, 2=confidential, 3=secret */
  @Column({ name: 'clearance_level', default: 0 })
  clearanceLevel: number;

  @OneToMany('UserPositionAssignment', 'user', { cascade: true })
  positionAssignments: Relation<UserPositionAssignment[]>;

  @OneToOne('UserPreferences', 'user', { cascade: true })
  preferences: Relation<UserPreferences>;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  get fullName(): string {
    const parts = [this.lastName, this.firstName, this.middleName].filter(Boolean);
    return parts.join(' ');
  }
}
