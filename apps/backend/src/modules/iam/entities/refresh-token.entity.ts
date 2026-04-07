import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { UserCredential } from './user-credential.entity';

@Entity({ name: 'refresh_tokens', schema: 'iam' })
@Index(['userId', 'family'])
export class RefreshToken {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id' })
  userId: string;

  @ManyToOne(() => UserCredential, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: UserCredential;

  @Index({ unique: true })
  @Column({ name: 'token_hash', length: 255 })
  tokenHash: string;

  // Family groups tokens issued from the same original login.
  // If a revoked family token is reused, all tokens in the family are revoked.
  @Column({ length: 36 })
  family: string;

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt: Date;

  @Column({ name: 'revoked_at', type: 'timestamptz', nullable: true })
  revokedAt: Date | null;

  @Column({ type: 'varchar',  name: 'ip_address', length: 45, nullable: true })
  ipAddress: string | null;

  @Column({ type: 'varchar',  name: 'user_agent', length: 512, nullable: true })
  userAgent: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
