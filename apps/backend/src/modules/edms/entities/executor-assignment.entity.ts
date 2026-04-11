import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
  ManyToOne,
  JoinColumn,
  type Relation,
} from 'typeorm';
import type { Resolution } from './resolution.entity';

export enum ExecutorAssignmentStatus {
  ASSIGNED = 'assigned',
  ACCEPTED = 'accepted',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
  OVERDUE = 'overdue',
  RETURNED = 'returned',
  CANCELLED = 'cancelled',
}

export enum ExecutorRole {
  PRIMARY = 'primary',      // Sole accountability
  CO_EXECUTOR = 'co_executor',
}

/**
 * A specific position assigned responsibility by a Resolution.
 * When converted to a Task, linkedTaskId is set.
 * This is the EDMS's formal execution record — Task Management owns the operational state.
 */
@Entity({ name: 'executor_assignments', schema: 'edms' })
@Index(['resolutionId', 'positionId'])
@Index(['documentId', 'status'])
export class ExecutorAssignment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'resolution_id', type: 'uuid' })
  resolutionId: string;

  @ManyToOne('Resolution', 'executorAssignments', { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'resolution_id' })
  resolution: Relation<Resolution>;

  /** Denormalized for quick filtering without joining resolution */
  @Column({ name: 'document_id', type: 'uuid' })
  documentId: string;

  /** Target position (obligation belongs to position, not person) */
  @Column({ name: 'position_id', type: 'uuid' })
  positionId: string;

  /** Snapshot of occupant at assignment time */
  @Column({ type: 'varchar', name: 'assigned_user_id', length: 255, nullable: true })
  assignedUserId: string | null;

  @Column({
    name: 'executor_role',
    type: 'enum',
    enum: ExecutorRole,
    enumName: 'executor_role',
    default: ExecutorRole.PRIMARY,
  })
  executorRole: ExecutorRole;

  /** Assignment instruction text (may differ from resolution text for co-executors) */
  @Column({ type: 'text', nullable: true })
  instruction: string | null;

  @Column({
    type: 'enum',
    enum: ExecutorAssignmentStatus,
    enumName: 'executor_assignment_status',
    default: ExecutorAssignmentStatus.ASSIGNED,
  })
  status: ExecutorAssignmentStatus;

  @Column({ name: 'deadline', type: 'date', nullable: true })
  deadline: string | null;

  /**
   * Parent assignment ID — set when this is a sub-assignment (§9.4).
   * Sub-assignments are created by a PRIMARY executor distributing work to subordinates.
   * Sub-assignment is one level deep without `document.execution.sub_assign_deep`.
   */
  @Column({ name: 'parent_assignment_id', type: 'uuid', nullable: true })
  parentAssignmentId: string | null;

  /** ID of the Task created in TaskManagement domain for this assignment */
  @Column({ type: 'varchar', name: 'linked_task_id', length: 255, nullable: true })
  linkedTaskId: string | null;

  /** Completion report filed by the executor */
  @Column({ name: 'completion_report', type: 'text', nullable: true })
  completionReport: string | null;

  @Column({ name: 'completed_at', type: 'timestamptz', nullable: true })
  completedAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
