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
import type { Document } from './document.entity';

export enum AttachmentRole {
  PRIMARY_BODY = 'primary_body',   // the main document file
  ANNEX = 'annex',                 // formally numbered annex
  SUPPORTING = 'supporting',       // background/reference material
  SIGNATURE = 'signature',         // cryptographic signature file
}

/**
 * Reference from a Document to a file stored in the FileManagement domain.
 * The EDMS owns the metadata; FileManagement owns the bytes.
 */
@Entity({ name: 'document_attachments', schema: 'edms' })
@Index(['documentId', 'role'])
export class DocumentAttachment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'document_id', type: 'uuid' })
  documentId: string;

  @ManyToOne('Document', 'attachments', { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'document_id' })
  document: Relation<Document>;

  /** File ID in FileManagement domain */
  @Column({ name: 'file_id', type: 'uuid' })
  fileId: string;

  @Column({ length: 255 })
  filename: string;

  @Column({ type: 'varchar',  name: 'mime_type', length: 100, nullable: true })
  mimeType: string | null;

  @Column({ name: 'file_size_bytes', type: 'bigint', nullable: true })
  fileSizeBytes: number | null;

  @Column({
    type: 'enum',
    enum: AttachmentRole,
    enumName: 'attachment_role',
    default: AttachmentRole.SUPPORTING,
  })
  role: AttachmentRole;

  /** Attachment-level classification (can be higher than document classification) */
  @Column({ type: 'smallint', default: 1 })
  classification: number;

  @Column({ name: 'uploaded_by_id', type: 'uuid' })
  uploadedById: string;

  @Column({ name: 'removed_at', type: 'timestamptz', nullable: true })
  removedAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
