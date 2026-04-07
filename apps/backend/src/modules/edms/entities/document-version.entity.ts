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

  @Column({ name: 'document_id', type: 'uuid' })
  documentId: string;

  @ManyToOne('Document', 'versions', { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'document_id' })
  document: Relation<Document>;

  @Column({ name: 'version_number' })
  versionNumber: number;

  @Column({ length: 500 })
  subject: string;

  @Column({ name: 'body', type: 'text', nullable: true })
  body: string | null;

  /** Snapshot of recipients at the time of this version */
  @Column({ name: 'recipients', type: 'jsonb', default: '[]' })
  recipients: unknown[];

  @Column({ name: 'author_id', type: 'uuid' })
  authorId: string;

  @Column({ type: 'varchar',  name: 'change_reason', length: 500, nullable: true })
  changeReason: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
