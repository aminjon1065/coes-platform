import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
  ManyToOne,
  JoinColumn,
  type Relation,
} from 'typeorm';
import type { FileRecord } from './file-record.entity';

@Entity({ name: 'file_versions', schema: 'files' })
@Index(['fileId', 'versionNumber'])
export class FileVersion {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'file_id' })
  fileId: string;

  @ManyToOne('FileRecord', 'versions', { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'file_id' })
  file: Relation<FileRecord>;

  @Column({ name: 'version_number' })
  versionNumber: number;

  /** MinIO object key: cls{n}/{fileId}/{version}/{sha256}.{ext} */
  @Column({ name: 'storage_key', length: 1000 })
  storageKey: string;

  @Column({ name: 'size_bytes', type: 'bigint' })
  sizeBytes: number;

  @Column({ name: 'sha256_hash', length: 64 })
  sha256Hash: string;

  @Column({ name: 'uploaded_by_id' })
  uploadedById: string;

  @Column({ type: 'varchar',  name: 'upload_note', length: 500, nullable: true })
  uploadNote: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
