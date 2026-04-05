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
} from 'typeorm';
import { DocumentType } from './document-type.entity';
import { DocumentVersion } from './document-version.entity';
import { DocumentAttachment } from './document-attachment.entity';

export enum DocumentStatus {
  DRAFT = 'draft',
  REGISTERED = 'registered',
  IN_WORKFLOW = 'in_workflow',
  COMPLETED = 'completed',
  ARCHIVED = 'archived',
  CANCELLED = 'cancelled',
}

/** Valid state transitions */
export const DOCUMENT_TRANSITIONS: Record<DocumentStatus, DocumentStatus[]> = {
  [DocumentStatus.DRAFT]:       [DocumentStatus.REGISTERED, DocumentStatus.CANCELLED],
  [DocumentStatus.REGISTERED]:  [DocumentStatus.IN_WORKFLOW, DocumentStatus.COMPLETED, DocumentStatus.CANCELLED],
  [DocumentStatus.IN_WORKFLOW]: [DocumentStatus.COMPLETED, DocumentStatus.REGISTERED, DocumentStatus.CANCELLED],
  [DocumentStatus.COMPLETED]:   [DocumentStatus.ARCHIVED],
  [DocumentStatus.ARCHIVED]:    [],
  [DocumentStatus.CANCELLED]:   [],
};

export enum DocumentDirection {
  INCOMING = 'incoming',
  OUTGOING = 'outgoing',
  INTERNAL = 'internal',
}

@Entity({ name: 'documents', schema: 'edms' })
@Index(['status', 'createdAt'])
@Index(['typeId', 'status'])
@Index(['registrationNumber'], { unique: true, where: "registration_number IS NOT NULL" })
export class Document {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'type_id' })
  typeId: string;

  @ManyToOne(() => DocumentType, { eager: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'type_id' })
  type: DocumentType;

  @Column({
    type: 'enum',
    enum: DocumentStatus,
    default: DocumentStatus.DRAFT,
  })
  status: DocumentStatus;

  @Column({
    name: 'direction',
    type: 'enum',
    enum: DocumentDirection,
    default: DocumentDirection.INTERNAL,
  })
  direction: DocumentDirection;

  @Column({ length: 500 })
  subject: string;

  /**
   * Official registration number assigned at registration.
   * Format: <series>-<seq>/<year>  e.g. "ВС-0147/2026"
   * NULL until the document is registered.
   */
  @Column({ name: 'registration_number', length: 50, nullable: true })
  registrationNumber: string | null;

  @Column({ name: 'registered_at', type: 'timestamptz', nullable: true })
  registeredAt: Date | null;

  /** Date stated on the document itself (may differ from registeredAt) */
  @Column({ name: 'document_date', type: 'date', nullable: true })
  documentDate: string | null;

  /** 0=public 1=internal 2=confidential 3=secret */
  @Column({ name: 'classification', default: 1 })
  classification: number;

  // ─── Sender (position-based for internal; free text for external) ───────
  @Column({ name: 'sender_position_id', nullable: true })
  senderPositionId: string | null;

  @Column({ name: 'sender_name', length: 300, nullable: true })
  senderName: string | null;

  /** External reference number (e.g. the number on an incoming letter) */
  @Column({ name: 'external_ref_number', length: 100, nullable: true })
  externalRefNumber: string | null;

  // ─── Recipient(s) stored as JSONB array of {positionId?, name, type} ────
  @Column({ name: 'recipients', type: 'jsonb', default: '[]' })
  recipients: Array<{
    positionId?: string;
    name: string;
    type: 'internal' | 'external';
  }>;

  /** Rich-text body (HTML/Markdown). Optional — document may be attachment-only. */
  @Column({ name: 'body', type: 'text', nullable: true })
  body: string | null;

  /** Deadline for execution (if applicable) */
  @Column({ name: 'deadline', type: 'date', nullable: true })
  deadline: string | null;

  /** Links: response_to, based_on, supersedes */
  @Column({ name: 'related_document_id', nullable: true })
  relatedDocumentId: string | null;

  /** The user (credentialId) who created this draft */
  @Column({ name: 'created_by_id' })
  createdById: string;

  /** The position from which the document was created */
  @Column({ name: 'created_by_position_id', nullable: true })
  createdByPositionId: string | null;

  @Column({ name: 'cancelled_at', type: 'timestamptz', nullable: true })
  cancelledAt: Date | null;

  @Column({ name: 'cancel_reason', length: 500, nullable: true })
  cancelReason: string | null;

  @OneToMany(() => DocumentVersion, (v) => v.document, { cascade: true })
  versions: DocumentVersion[];

  @OneToMany(() => DocumentAttachment, (a) => a.document, { cascade: true })
  attachments: DocumentAttachment[];

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
