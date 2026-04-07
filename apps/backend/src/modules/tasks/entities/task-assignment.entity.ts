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
import type { Task } from './task.entity';

export enum AssignmentType {
  PRIMARY = 'primary',       // Solely accountable
  CO_EXECUTOR = 'co_executor', // Contributing, not accountable
  OBSERVER = 'observer',      // Visibility only
}

export enum AssignmentStatus {
  ACTIVE = 'active',
  COMPLETED = 'completed',
  REMOVED = 'removed',
}

/**
 * First-class link between a task and a participant position.
 * Assignments target positions, not users — current occupant resolved at query time.
 */
@Entity({ name: 'task_assignments', schema: 'tasks' })
@Index(['taskId', 'positionId'], { unique: true, where: "status = 'active'" })
@Index(['positionId', 'status'])
export class TaskAssignment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'task_id' })
  taskId: string;

  @ManyToOne('Task', 'assignments', { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'task_id' })
  task: Relation<Task>;

  /** Position assigned (the obligation target) */
  @Column({ name: 'position_id' })
  positionId: string;

  /** Snapshot of the occupying user at assignment time */
  @Column({ type: 'varchar',  name: 'assigned_user_id', nullable: true })
  assignedUserId: string | null;

  @Column({
    name: 'assignment_type',
    type: 'enum',
    enum: AssignmentType,
    default: AssignmentType.PRIMARY,
  })
  assignmentType: AssignmentType;

  @Column({
    type: 'enum',
    enum: AssignmentStatus,
    default: AssignmentStatus.ACTIVE,
  })
  status: AssignmentStatus;

  /** Position of the user who made this assignment */
  @Column({ name: 'assigned_by_position_id' })
  assignedByPositionId: string;

  /** User who performed this assignment */
  @Column({ name: 'assigned_by_user_id' })
  assignedByUserId: string;

  /** Specific deadline for this executor (may differ from task deadline) */
  @Column({ name: 'deadline', type: 'date', nullable: true })
  deadline: string | null;

  /** When executor formally acknowledged the assignment */
  @Column({ name: 'accepted_at', type: 'timestamptz', nullable: true })
  acceptedAt: Date | null;

  @Column({ name: 'removed_at', type: 'timestamptz', nullable: true })
  removedAt: Date | null;

  @Column({ type: 'varchar',  name: 'remove_reason', length: 500, nullable: true })
  removeReason: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
