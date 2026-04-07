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
import type { WorkflowInstance } from './workflow-instance.entity';
import { StepType } from './workflow-step-definition.entity';

export enum WorkflowStepStatus {
  PENDING = 'pending',       // Not yet active
  ACTIVE = 'active',         // Current step, awaiting action
  OVERDUE = 'overdue',       // Deadline passed, escalation active
  COMPLETED = 'completed',
  RETURNED = 'returned',     // Actor returned document for revision
  SKIPPED = 'skipped',       // Optional step that was bypassed
}

export enum WorkflowStepAction {
  REVIEWED = 'reviewed',
  ENDORSED = 'endorsed',
  ENDORSED_CONDITIONALLY = 'endorsed_conditionally',
  APPROVED = 'approved',
  REJECTED = 'rejected',
  SIGNED = 'signed',
  RESOLUTION_ISSUED = 'resolution_issued',
  DISTRIBUTED = 'distributed',
  ACKNOWLEDGED = 'acknowledged',
  RETURNED = 'returned',
  ESCALATED = 'escalated',
}

/**
 * One concrete, position-resolved step in an active WorkflowInstance.
 * Created when the workflow engine activates the step (not at instance creation).
 */
@Entity({ name: 'workflow_steps', schema: 'edms' })
@Index(['instanceId', 'stepOrder'])
@Index(['positionId', 'status'])
export class WorkflowStep {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'instance_id', type: 'uuid' })
  instanceId: string;

  @ManyToOne('WorkflowInstance', 'steps', { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'instance_id' })
  instance: Relation<WorkflowInstance>;

  /** Matches WorkflowStepDefinition.stepOrder */
  @Column({ name: 'step_order' })
  stepOrder: number;

  @Column({ name: 'step_name', length: 200 })
  stepName: string;

  @Column({
    name: 'step_type',
    type: 'enum',
    enum: StepType,
    enumName: 'workflow_step_type',
  })
  stepType: StepType;

  @Column({
    type: 'enum',
    enum: WorkflowStepStatus,
    enumName: 'workflow_step_status',
    default: WorkflowStepStatus.PENDING,
  })
  status: WorkflowStepStatus;

  /** Target position resolved at activation time */
  @Column({ name: 'position_id', type: 'uuid' })
  positionId: string;

  /** Snapshot of occupant at activation time (for display) */
  @Column({ type: 'varchar', name: 'assigned_user_id', length: 255, nullable: true })
  assignedUserId: string | null;

  /** Whether this step operates in parallel with sibling steps */
  @Column({ name: 'is_parallel', default: false })
  isParallel: boolean;

  /** Timestamp when this step became ACTIVE */
  @Column({ name: 'activated_at', type: 'timestamptz', nullable: true })
  activatedAt: Date | null;

  /** Step deadline (calculated from timeout_hours at activation time) */
  @Column({ name: 'deadline', type: 'timestamptz', nullable: true })
  deadline: Date | null;

  /** When step was first marked overdue */
  @Column({ name: 'overdue_at', type: 'timestamptz', nullable: true })
  overdueAt: Date | null;

  /** Whether secondary escalation has fired */
  @Column({ name: 'secondary_escalation_fired', default: false })
  secondaryEscalationFired: boolean;

  /** Action taken */
  @Column({
    name: 'action_taken',
    type: 'enum',
    enum: WorkflowStepAction,
    enumName: 'workflow_step_action',
    nullable: true,
  })
  actionTaken: WorkflowStepAction | null;

  /** User who acted on this step */
  @Column({ type: 'varchar', name: 'actor_id', length: 255, nullable: true })
  actorId: string | null;

  /** Position from which the actor acted */
  @Column({ type: 'varchar', name: 'actor_position_id', length: 255, nullable: true })
  actorPositionId: string | null;

  /**
   * Delegation ID if the actor was acting under delegation.
   * Links to Authorization.Delegation entity.
   */
  @Column({ type: 'varchar', name: 'delegation_id', length: 255, nullable: true })
  delegationId: string | null;

  /** Formal remarks attached to the action */
  @Column({ name: 'remarks', type: 'text', nullable: true })
  remarks: string | null;

  @Column({ name: 'completed_at', type: 'timestamptz', nullable: true })
  completedAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
