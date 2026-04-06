import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
  Unique,
  ManyToOne,
  JoinColumn,
  type Relation,
} from 'typeorm';
import type { FileRecord } from './file-record.entity';

export enum PermissionAction {
  READ     = 'read',
  DOWNLOAD = 'download',
  WRITE    = 'write',
  DELETE   = 'delete',
  SHARE    = 'share',
}

export enum PermissionEffect {
  ALLOW = 'allow',
  DENY  = 'deny',
}

@Entity({ name: 'file_permissions', schema: 'files' })
@Unique(['fileId', 'granteePositionId', 'action'])
@Index(['fileId'])
@Index(['granteePositionId'])
export class FilePermission {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'file_id' })
  fileId: string;

  @ManyToOne('FileRecord', 'permissions', { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'file_id' })
  file: Relation<FileRecord>;

  @Column({ name: 'grantee_position_id' })
  granteePositionId: string;

  @Column({ type: 'enum', enum: PermissionAction })
  action: PermissionAction;

  @Column({ type: 'enum', enum: PermissionEffect, default: PermissionEffect.ALLOW })
  effect: PermissionEffect;

  @Column({ name: 'granted_by_id' })
  grantedById: string;

  @Column({ name: 'expires_at', type: 'timestamptz', nullable: true })
  expiresAt: Date | null;

  @Column({ name: 'revoked_at', type: 'timestamptz', nullable: true })
  revokedAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
