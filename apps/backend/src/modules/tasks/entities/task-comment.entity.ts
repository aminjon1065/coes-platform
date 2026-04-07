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
 * Short operational communication attached to a task.
 * Distinct from full discussion threads in the Communication domain.
 */
@Entity({ name: 'task_comments', schema: 'tasks' })
@Index(['taskId', 'createdAt'])
export class TaskComment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'task_id', type: 'uuid' })
  taskId: string;

  @ManyToOne('Task', 'comments', { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'task_id' })
  task: Relation<Task>;

  @Column({ name: 'author_id' })
  authorId: string;

  @Column({ type: 'varchar',  name: 'author_position_id', nullable: true })
  authorPositionId: string | null;

  @Column({ type: 'text' })
  body: string;

  /**
   * Internal comments are visible only to the assigning chain and supervisors,
   * not to co-executors or observers.
   */
  @Column({ name: 'is_internal', default: false })
  isInternal: boolean;

  /** Soft-delete: set when comment is removed */
  @Column({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
