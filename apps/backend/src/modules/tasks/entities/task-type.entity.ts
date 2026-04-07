import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * TaskType defines behavioral configuration for a category of tasks.
 * Examples: Emergency Response Task, Leadership Directive Task, Regulatory Compliance Task.
 */
@Entity({ name: 'task_types', schema: 'tasks' })
export class TaskType {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 100, unique: true })
  name: string;

  @Column({ type: 'varchar',  name: 'name_ru', length: 100, nullable: true })
  nameRu: string | null;

  @Column({ type: 'varchar',  name: 'name_tg', length: 100, nullable: true })
  nameTg: string | null;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  /** Default priority: critical=4, high=3, normal=2, low=1 */
  @Column({ name: 'default_priority', default: 2 })
  defaultPriority: number;

  /** Days from assignment to default deadline (null = no default) */
  @Column({ type: 'int',  name: 'default_deadline_days', nullable: true })
  defaultDeadlineDays: number | null;

  /** Whether executor must explicitly ACCEPT before work begins */
  @Column({ name: 'requires_acceptance', default: false })
  requiresAcceptance: boolean;

  /** Whether assigning authority must VERIFY completion */
  @Column({ name: 'requires_verification', default: false })
  requiresVerification: boolean;

  /** Whether co-executors are allowed */
  @Column({ name: 'supports_co_executors', default: true })
  supportsCoExecutors: boolean;

  /** Whether subtasks can be created under this task type */
  @Column({ name: 'supports_subtasks', default: true })
  supportsSubtasks: boolean;

  /** Whether DRAFT state is used before ASSIGNED */
  @Column({ name: 'supports_draft', default: false })
  supportsDraft: boolean;

  @Column({ default: true })
  active: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
