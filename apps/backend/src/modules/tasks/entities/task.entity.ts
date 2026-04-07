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
import { TaskType } from './task-type.entity';
import type { TaskAssignment } from './task-assignment.entity';
import type { TaskHistory } from './task-history.entity';
import type { TaskComment } from './task-comment.entity';
import type { TaskAttachment } from './task-attachment.entity';

export enum TaskStatus {
  DRAFT = 'draft',
  ASSIGNED = 'assigned',
  ACCEPTED = 'accepted',
  IN_PROGRESS = 'in_progress',
  ON_HOLD = 'on_hold',
  COMPLETED = 'completed',
  VERIFIED = 'verified',
  RETURNED = 'returned',
  CANNOT_EXECUTE = 'cannot_execute',
  CANCELLED = 'cancelled',
  CLOSED = 'closed',
}

export enum TaskPriority {
  LOW = 'low',
  NORMAL = 'normal',
  HIGH = 'high',
  CRITICAL = 'critical',
}

export enum TaskSource {
  MANUAL = 'manual',
  DOCUMENT_GENERATED = 'document_generated',
  SYSTEM_GENERATED = 'system_generated',
}

/**
 * Valid status transitions for the task state machine.
 * OVERDUE is a flag on top of the existing status, not a separate status.
 */
export const TASK_TRANSITIONS: Record<TaskStatus, TaskStatus[]> = {
  [TaskStatus.DRAFT]: [TaskStatus.ASSIGNED, TaskStatus.CANCELLED],
  [TaskStatus.ASSIGNED]: [
    TaskStatus.ACCEPTED,
    TaskStatus.IN_PROGRESS,
    TaskStatus.CANNOT_EXECUTE,
    TaskStatus.CANCELLED,
  ],
  [TaskStatus.ACCEPTED]: [
    TaskStatus.IN_PROGRESS,
    TaskStatus.ON_HOLD,
    TaskStatus.CANNOT_EXECUTE,
    TaskStatus.CANCELLED,
  ],
  [TaskStatus.IN_PROGRESS]: [
    TaskStatus.COMPLETED,
    TaskStatus.ON_HOLD,
    TaskStatus.CANNOT_EXECUTE,
    TaskStatus.CANCELLED,
  ],
  [TaskStatus.ON_HOLD]: [
    TaskStatus.IN_PROGRESS,
    TaskStatus.CANCELLED,
  ],
  [TaskStatus.COMPLETED]: [
    TaskStatus.VERIFIED,
    TaskStatus.RETURNED,
    TaskStatus.CLOSED,
  ],
  [TaskStatus.VERIFIED]: [TaskStatus.CLOSED],
  [TaskStatus.RETURNED]: [TaskStatus.IN_PROGRESS],
  [TaskStatus.CANNOT_EXECUTE]: [
    TaskStatus.IN_PROGRESS,
    TaskStatus.ASSIGNED,
    TaskStatus.CANCELLED,
  ],
  [TaskStatus.CANCELLED]: [TaskStatus.CLOSED],
  [TaskStatus.CLOSED]: [],
};

@Entity({ name: 'tasks', schema: 'tasks' })
@Index(['status', 'createdAt'])
@Index(['typeId', 'status'])
@Index(['assigningPositionId', 'status'])
@Index(['deadline', 'status'], { where: "deadline IS NOT NULL AND status NOT IN ('completed','verified','cancelled','closed')" })
export class Task {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'type_id' })
  typeId: string;

  @ManyToOne(() => TaskType, { eager: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'type_id' })
  type: TaskType;

  @Column({ length: 500 })
  title: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({
    type: 'enum',
    enum: TaskStatus,
    default: TaskStatus.ASSIGNED,
  })
  status: TaskStatus;

  @Column({
    type: 'enum',
    enum: TaskPriority,
    default: TaskPriority.NORMAL,
  })
  priority: TaskPriority;

  @Column({
    type: 'enum',
    enum: TaskSource,
    default: TaskSource.MANUAL,
  })
  source: TaskSource;

  /** 0=public 1=internal 2=confidential 3=secret */
  @Column({ name: 'classification', default: 1 })
  classification: number;

  // ─── Assigning authority ────────────────────────────────────────────────────

  /** Position that created/assigned this task */
  @Column({ name: 'assigning_position_id' })
  assigningPositionId: string;

  /** User (credential id) who created this task */
  @Column({ name: 'created_by_id' })
  createdById: string;

  // ─── Responsible executor (primary accountability) ──────────────────────────

  /** Position responsible for completing this task */
  @Column({ name: 'responsible_position_id' })
  responsiblePositionId: string;

  // ─── Hierarchy (subtasks) ───────────────────────────────────────────────────

  @Column({ type: 'varchar',  name: 'parent_task_id', nullable: true })
  parentTaskId: string | null;

  @ManyToOne(() => Task, (t) => t.subtasks, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'parent_task_id' })
  parentTask: Task | null;

  @OneToMany(() => Task, (t) => t.parentTask)
  subtasks: Task[];

  /** Depth level in hierarchy: 0 = root, max 3 */
  @Column({ name: 'depth', default: 0 })
  depth: number;

  // ─── EDMS / system integration links ───────────────────────────────────────

  @Column({ type: 'varchar',  name: 'source_document_id', nullable: true })
  sourceDocumentId: string | null;

  @Column({ type: 'varchar',  name: 'source_resolution_id', nullable: true })
  sourceResolutionId: string | null;

  /** Linked discussion channel in Communication domain */
  @Column({ type: 'varchar',  name: 'discussion_channel_id', nullable: true })
  discussionChannelId: string | null;

  // ─── Deadline ───────────────────────────────────────────────────────────────

  @Column({ name: 'deadline', type: 'date', nullable: true })
  deadline: string | null;

  /** Whether deadline has passed without completion */
  @Column({ name: 'is_overdue', default: false })
  isOverdue: boolean;

  /** When the task was marked overdue */
  @Column({ name: 'overdue_at', type: 'timestamptz', nullable: true })
  overdueAt: Date | null;

  // ─── Progress (human-reported) ──────────────────────────────────────────────

  /** Last reported progress percentage (0–100) */
  @Column({ name: 'progress_percent', default: 0 })
  progressPercent: number;

  /** Latest status narrative from executor */
  @Column({ name: 'progress_note', type: 'text', nullable: true })
  progressNote: string | null;

  // ─── Completion / cancellation ──────────────────────────────────────────────

  @Column({ name: 'completion_report', type: 'text', nullable: true })
  completionReport: string | null;

  @Column({ name: 'completed_at', type: 'timestamptz', nullable: true })
  completedAt: Date | null;

  @Column({ name: 'cancelled_at', type: 'timestamptz', nullable: true })
  cancelledAt: Date | null;

  @Column({ type: 'varchar',  name: 'cancel_reason', length: 500, nullable: true })
  cancelReason: string | null;

  @Column({ type: 'varchar',  name: 'hold_reason', length: 500, nullable: true })
  holdReason: string | null;

  @Column({ type: 'varchar',  name: 'cannot_execute_reason', length: 500, nullable: true })
  cannotExecuteReason: string | null;

  // ─── Relations ──────────────────────────────────────────────────────────────

  @OneToMany('TaskAssignment', 'task', { cascade: true })
  assignments: Relation<TaskAssignment[]>;

  @OneToMany('TaskHistory', 'task', { cascade: true })
  history: Relation<TaskHistory[]>;

  @OneToMany('TaskComment', 'task', { cascade: true })
  comments: Relation<TaskComment[]>;

  @OneToMany('TaskAttachment', 'task', { cascade: true })
  attachments: Relation<TaskAttachment[]>;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
