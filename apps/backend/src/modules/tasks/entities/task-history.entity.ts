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

/**
 * Immutable append-only log of every significant action on a task.
 * Business history layer — distinct from the platform-level Audit Log.
 */
@Entity({ name: 'task_history', schema: 'tasks' })
@Index(['taskId', 'createdAt'])
export class TaskHistory {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'task_id', type: 'uuid' })
  taskId: string;

  @ManyToOne('Task', 'history', { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'task_id' })
  task: Relation<Task>;

  /** Type of action, e.g. "status_changed", "assigned", "progress_updated" */
  @Column({ name: 'event_type', length: 100 })
  eventType: string;

  /** User who performed the action */
  @Column({ name: 'actor_id' })
  actorId: string;

  /** Position from which the actor acted */
  @Column({ type: 'varchar',  name: 'actor_position_id', nullable: true })
  actorPositionId: string | null;

  /** Previous state value (JSON-serialized) */
  @Column({ name: 'previous_value', type: 'jsonb', nullable: true })
  previousValue: Record<string, unknown> | null;

  /** New state value (JSON-serialized) */
  @Column({ name: 'new_value', type: 'jsonb', nullable: true })
  newValue: Record<string, unknown> | null;

  /** Human-readable reason or remark */
  @Column({ type: 'text', nullable: true })
  remark: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
