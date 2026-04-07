import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
  OneToMany,
  type Relation,
} from 'typeorm';
import type { ExecutorAssignment } from './executor-assignment.entity';

export enum ResolutionPriority {
  ROUTINE = 'routine',
  URGENT = 'urgent',
  EMERGENCY = 'emergency',
}

/**
 * A formal executive directive issued by a leadership official on a document.
 * Resolution → creates ExecutorAssignments → triggers Task creation in TaskManagement.
 */
@Entity({ name: 'resolutions', schema: 'edms' })
@Index(['documentId'])
@Index(['issuingPositionId'])
export class Resolution {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'document_id', type: 'uuid' })
  documentId: string;

  /** The step in the workflow instance where the resolution was issued */
  @Column({ name: 'workflow_step_id', type: 'uuid', nullable: true })
  workflowStepId: string | null;

  /** Position issuing the resolution */
  @Column({ name: 'issuing_position_id', type: 'uuid' })
  issuingPositionId: string;

  /** User who issued the resolution */
  @Column({ name: 'issuing_user_id', type: 'uuid' })
  issuingUserId: string;

  /** The instruction text */
  @Column({ type: 'text' })
  text: string;

  @Column({
    type: 'enum',
    enum: ResolutionPriority,
    enumName: 'resolution_priority',
    default: ResolutionPriority.ROUTINE,
  })
  priority: ResolutionPriority;

  /** Deadline imposed by this resolution on executors */
  @Column({ name: 'deadline', type: 'date', nullable: true })
  deadline: string | null;

  @OneToMany('ExecutorAssignment', 'resolution', { cascade: true })
  executorAssignments: Relation<ExecutorAssignment[]>;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
