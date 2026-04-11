import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

export enum DeadlineExtensionStatus {
  PENDING = 'pending',
  APPROVED = 'approved',
  DENIED = 'denied',
}

/**
 * Formal deadline extension request filed by an executor against their assignment (§9.6).
 *
 * An executor who cannot meet the original deadline must file this request.
 * The resolution-issuing authority (or their supervisor) approves or denies.
 * Approval modifies the executor_assignment.deadline and records the modification.
 * Each extension requires a new justification — repeated extensions are surfaced
 * in execution monitoring reports.
 */
@Entity({ name: 'deadline_extension_requests', schema: 'edms' })
@Index(['assignmentId', 'status'])
@Index(['documentId', 'status'])
export class DeadlineExtensionRequest {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** The executor assignment whose deadline is being requested for extension */
  @Column({ name: 'assignment_id', type: 'uuid' })
  assignmentId: string;

  /** Denormalized for filtering without assignment join */
  @Column({ name: 'document_id', type: 'uuid' })
  documentId: string;

  /** Position of the requesting executor */
  @Column({ name: 'requester_position_id', type: 'uuid' })
  requesterPositionId: string;

  /** User who filed the request */
  @Column({ name: 'requester_id', type: 'uuid' })
  requesterId: string;

  /** The current deadline being requested to extend */
  @Column({ name: 'current_deadline', type: 'date' })
  currentDeadline: string;

  /** The requested new deadline */
  @Column({ name: 'requested_deadline', type: 'date' })
  requestedDeadline: string;

  /** Mandatory justification for why more time is needed */
  @Column({ type: 'text' })
  justification: string;

  @Column({
    type: 'enum',
    enum: DeadlineExtensionStatus,
    enumName: 'deadline_extension_status',
    default: DeadlineExtensionStatus.PENDING,
  })
  status: DeadlineExtensionStatus;

  /** Position that approved or denied (resolution-issuing authority or superior) */
  @Column({ name: 'reviewed_by_position_id', type: 'uuid', nullable: true })
  reviewedByPositionId: string | null;

  @Column({ name: 'reviewed_by_id', type: 'uuid', nullable: true })
  reviewedById: string | null;

  /** Required when denied — why the extension was not granted */
  @Column({ name: 'review_remarks', type: 'text', nullable: true })
  reviewRemarks: string | null;

  @Column({ name: 'reviewed_at', type: 'timestamptz', nullable: true })
  reviewedAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
