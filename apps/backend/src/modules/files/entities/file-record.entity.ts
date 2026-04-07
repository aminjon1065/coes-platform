import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
  ManyToOne,
  OneToMany,
  JoinColumn,
  type Relation,
} from 'typeorm';
import { FileFolder } from './file-folder.entity';
import type { FileVersion } from './file-version.entity';
import type { FilePermission } from './file-permission.entity';
import type { FileLink } from './file-link.entity';

export enum ScanStatus {
  PENDING     = 'pending',
  CLEAN       = 'clean',
  INFECTED    = 'infected',
  SCAN_FAILED = 'scan_failed',
}

@Entity({ name: 'file_records', schema: 'files' })
@Index(['folderId'])
@Index(['ownerPositionId'])
@Index(['scanStatus'])
@Index(['classification'])
export class FileRecord {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'display_name', length: 500 })
  displayName: string;

  @Column({ name: 'original_filename', length: 500 })
  originalFilename: string;

  @Column({ type: 'varchar',  name: 'mime_type', length: 100, nullable: true })
  mimeType: string | null;

  @Column({ type: 'varchar',  name: 'folder_id', nullable: true })
  folderId: string | null;

  @ManyToOne(() => FileFolder, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'folder_id' })
  folder: FileFolder | null;

  /** 0=unrestricted 1=internal 2=confidential 3=secret */
  @Column({ default: 1 })
  classification: number;

  @Column({ name: 'owner_position_id' })
  ownerPositionId: string;

  @Column({ name: 'uploaded_by_id' })
  uploadedById: string;

  /** FK to current (latest) version — DEFERRABLE in DB, nullable until first version is saved */
  @Column({ type: 'varchar',  name: 'current_version_id', nullable: true })
  currentVersionId: string | null;

  @ManyToOne('FileVersion', { nullable: true, eager: true })
  @JoinColumn({ name: 'current_version_id' })
  currentVersion: Relation<FileVersion> | null;

  @Column({ name: 'total_size_bytes', type: 'bigint', default: 0 })
  totalSizeBytes: number;

  @Column({ name: 'version_count', default: 0 })
  versionCount: number;

  @Column({
    name: 'scan_status',
    type: 'enum',
    enum: ScanStatus,
    default: ScanStatus.PENDING,
  })
  scanStatus: ScanStatus;

  @Column({ name: 'scanned_at', type: 'timestamptz', nullable: true })
  scannedAt: Date | null;

  @Column({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt: Date | null;

  @OneToMany('FileVersion', 'file')
  versions: Relation<FileVersion[]>;

  @OneToMany('FilePermission', 'file')
  permissions: Relation<FilePermission[]>;

  @OneToMany('FileLink', 'file')
  links: Relation<FileLink[]>;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
