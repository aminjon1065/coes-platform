import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

export enum CredentialStatus {
  ACTIVE = 'active',
  LOCKED = 'locked',
  SUSPENDED = 'suspended',
  PENDING_RESET = 'pending_reset',
}

@Entity({ name: 'user_credentials', schema: 'iam' })
export class UserCredential {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index({ unique: true })
  @Column({ length: 100 })
  username: string;

  @Index({ unique: true })
  @Column({ length: 255 })
  email: string;

  @Column({ name: 'password_hash', length: 255 })
  passwordHash: string;

  @Column({
    type: 'enum',
    enum: CredentialStatus,
    default: CredentialStatus.ACTIVE,
  })
  status: CredentialStatus;

  @Column({ name: 'failed_attempts', default: 0 })
  failedAttempts: number;

  @Column({ name: 'locked_until', type: 'timestamptz', nullable: true })
  lockedUntil: Date | null;

  @Column({ name: 'last_login_at', type: 'timestamptz', nullable: true })
  lastLoginAt: Date | null;

  @Column({ name: 'password_changed_at', type: 'timestamptz', nullable: true })
  passwordChangedAt: Date | null;

  @Column({ name: 'is_service_account', default: false })
  isServiceAccount: boolean;

  // ── SSO columns (Phase 6.1) ──────────────────────────────────────────────

  @Column({ name: 'sso_provider', type: 'varchar', length: 50, nullable: true })
  ssoProvider: string | null;

  @Column({ type: 'varchar',  name: 'sso_subject_id', length: 500, nullable: true })
  ssoSubjectId: string | null;

  @Column({ name: 'sso_attributes', type: 'jsonb', nullable: true })
  ssoAttributes: Record<string, any> | null;

  @Column({ name: 'sso_linked_at', type: 'timestamptz', nullable: true })
  ssoLinkedAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
