import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Document } from './document.entity';

/**
 * Immutable snapshot of a document at a point in time.
 * Created on every save in DRAFT and on every return-for-revision.
 * Never updated or deleted.
 */
@Entity({ name: 'document_versions', schema: 'edms' })
@Index(['documentId', 'versionNumber'])
export class DocumentVersion {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'document_id' })
  documentId: string;

  @ManyToOne(() => Document, (d) => d.versions, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'document_id' })
  document: Document;

  @Column({ name: 'version_number' })
  versionNumber: number;

  @Column({ length: 500 })
  subject: string;

  @Column({ name: 'body', type: 'text', nullable: true })
  body: string | null;

  /** Snapshot of recipients at the time of this version */
  @Column({ name: 'recipients', type: 'jsonb', default: '[]' })
  recipients: unknown[];

  @Column({ name: 'author_id' })
  authorId: string;

  @Column({ name: 'change_reason', length: 500, nullable: true })
  changeReason: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
