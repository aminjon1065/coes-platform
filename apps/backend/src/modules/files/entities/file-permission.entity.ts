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

  @Column({ name: 'file_id', type: 'uuid' })
  fileId: string;

  @ManyToOne('FileRecord', 'permissions', { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'file_id' })
  file: Relation<FileRecord>;

  @Column({ name: 'grantee_position_id', type: 'uuid' })
  granteePositionId: string;

  @Column({ type: 'enum', enum: PermissionAction, enumName: 'permission_action' })
  action: PermissionAction;

  @Column({ type: 'enum', enum: PermissionEffect, enumName: 'permission_effect', default: PermissionEffect.ALLOW })
  effect: PermissionEffect;

  @Column({ name: 'granted_by_id', type: 'uuid' })
  grantedById: string;

  @Column({ name: 'expires_at', type: 'timestamptz', nullable: true })
  expiresAt: Date | null;

  @Column({ name: 'revoked_at', type: 'timestamptz', nullable: true })
  revokedAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
