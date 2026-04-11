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
import type { Task } from './task.entity';

export enum TaskExtensionStatus {
  PENDING = 'pending',
  APPROVED = 'approved',
  DENIED = 'denied',
}

/**
 * Formal deadline extension request filed by the responsible executor (§4.10, §17.3).
 *
 * An executor who cannot meet the original deadline must file this request with a
 * mandatory justification. The assigning authority or their supervisor approves or denies.
 * On approval, the task's deadline is updated and this record is permanently preserved.
 *
 * Maximum extension count per task type is configurable. Repeated extensions are surfaced
 * in performance analytics (§15.2).
 */
@Entity({ name: 'deadline_extension_requests', schema: 'tasks' })
@Index(['taskId', 'status'])
export class TaskDeadlineExtensionRequest {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'task_id', type: 'uuid' })
  taskId: string;

  @ManyToOne('Task', { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'task_id' })
  task: Relation<Task>;

  /** Position of the requesting executor */
  @Column({ name: 'requester_position_id' })
  requesterPositionId: string;

  /** User who filed the request */
  @Column({ name: 'requester_id' })
  requesterId: string;

  /** The deadline being requested to extend */
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
    enum: TaskExtensionStatus,
    enumName: 'deadline_extension_status',
    default: TaskExtensionStatus.PENDING,
  })
  status: TaskExtensionStatus;

  /** Position that approved or denied */
  @Column({ name: 'reviewed_by_position_id', type: 'varchar', nullable: true })
  reviewedByPositionId: string | null;

  @Column({ name: 'reviewed_by_id', type: 'varchar', nullable: true })
  reviewedById: string | null;

  /** Required when denied — why the extension was not granted */
  @Column({ name: 'review_remarks', type: 'text', nullable: true })
  reviewRemarks: string | null;

  @Column({ name: 'reviewed_at', type: 'timestamptz', nullable: true })
  reviewedAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
