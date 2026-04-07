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
import { WorkflowTemplate } from './workflow-template.entity';
import type { WorkflowStep } from './workflow-step.entity';

export enum WorkflowInstanceStatus {
  ACTIVE = 'active',
  SUSPENDED = 'suspended',    // Returned for revision, awaiting resubmission
  COMPLETED = 'completed',
  REJECTED = 'rejected',
  CANCELLED = 'cancelled',
}

/**
 * A running workflow process on a specific document.
 * At most one active instance per document at a time.
 */
@Entity({ name: 'workflow_instances', schema: 'edms' })
@Index(['documentId', 'status'])
export class WorkflowInstance {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'document_id', type: 'uuid' })
  documentId: string;

  @Column({ name: 'template_id', type: 'uuid' })
  templateId: string;

  @ManyToOne(() => WorkflowTemplate, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'template_id' })
  template: WorkflowTemplate;

  /** Template version snapshot at instance creation time */
  @Column({ name: 'template_version' })
  templateVersion: number;

  @Column({
    type: 'enum',
    enum: WorkflowInstanceStatus,
    enumName: 'workflow_instance_status',
    default: WorkflowInstanceStatus.ACTIVE,
  })
  status: WorkflowInstanceStatus;

  /** Step order of the currently active step */
  @Column({ type: 'int',  name: 'current_step_order', nullable: true })
  currentStepOrder: number | null;

  /** Who initiated this workflow instance */
  @Column({ name: 'initiated_by_id', type: 'uuid' })
  initiatedById: string;

  @Column({ type: 'varchar', name: 'initiated_by_position_id', length: 255, nullable: true })
  initiatedByPositionId: string | null;

  /** Deadline for the entire workflow (may differ from individual step deadlines) */
  @Column({ name: 'deadline', type: 'timestamptz', nullable: true })
  deadline: Date | null;

  @Column({ name: 'completed_at', type: 'timestamptz', nullable: true })
  completedAt: Date | null;

  @Column({ name: 'rejected_at', type: 'timestamptz', nullable: true })
  rejectedAt: Date | null;

  @Column({ name: 'rejection_reason', type: 'text', nullable: true })
  rejectionReason: string | null;

  @OneToMany('WorkflowStep', 'instance', { cascade: true })
  steps: Relation<WorkflowStep[]>;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
