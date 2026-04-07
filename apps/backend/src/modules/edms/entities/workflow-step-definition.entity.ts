import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  type Relation,
} from 'typeorm';
import type { WorkflowTemplate } from './workflow-template.entity';

export enum StepType {
  REVIEW = 'review',
  ENDORSEMENT = 'endorsement',
  APPROVAL = 'approval',
  SIGNING = 'signing',
  RESOLUTION = 'resolution',
  DISTRIBUTION = 'distribution',
  EXECUTION = 'execution',
  ACKNOWLEDGEMENT = 'acknowledgement',
}

/**
 * How to resolve the target position(s) at step-activation time.
 * Stored as JSONB so resolver logic can be extended without schema changes.
 *
 * Examples:
 *   { type: "fixed_position", positionId: "uuid" }
 *   { type: "document_author_supervisor" }
 *   { type: "department_head", departmentId: "uuid" }
 *   { type: "role_in_department", role: "department_head", departmentId: "uuid" }
 *   { type: "organization_leadership", level: "chairman" }
 */
export type TargetResolver = Record<string, unknown>;

/**
 * One step in a WorkflowTemplate.
 * When instantiated, becomes a WorkflowStep with concrete positions.
 */
@Entity({ name: 'workflow_step_definitions', schema: 'edms' })
export class WorkflowStepDefinition {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'template_id' })
  templateId: string;

  @ManyToOne('WorkflowTemplate', 'steps', { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'template_id' })
  template: Relation<WorkflowTemplate>;

  /** 1-based ordering within the template */
  @Column({ name: 'step_order' })
  stepOrder: number;

  @Column({ name: 'step_name', length: 200 })
  stepName: string;

  @Column({
    name: 'step_type',
    type: 'enum',
    enum: StepType,
  })
  stepType: StepType;

  /** How to resolve the target position(s) */
  @Column({ name: 'target_resolver', type: 'jsonb' })
  targetResolver: TargetResolver;

  /** Whether all targets act simultaneously (true) or one at a time (false) */
  @Column({ name: 'is_parallel', default: false })
  isParallel: boolean;

  /**
   * For parallel steps: how many completions needed to advance.
   * null = all must complete.
   */
  @Column({ type: 'int',  name: 'parallel_threshold', nullable: true })
  parallelThreshold: number | null;

  /** Hours before the step is marked overdue (null = no timeout) */
  @Column({ type: 'int',  name: 'timeout_hours', nullable: true })
  timeoutHours: number | null;

  /**
   * Hours after first escalation before secondary escalation fires.
   * null = no secondary escalation.
   */
  @Column({ type: 'int',  name: 'secondary_escalation_hours', nullable: true })
  secondaryEscalationHours: number | null;

  /**
   * Which step to return to on revision (by stepOrder).
   * null = return to author.
   */
  @Column({ type: 'int',  name: 'return_to_step', nullable: true })
  returnToStep: number | null;

  /**
   * JSONB condition that determines if this step is active.
   * null = always active.
   * Example: { "classification": { "gte": 2 } }
   */
  @Column({ name: 'condition', type: 'jsonb', nullable: true })
  condition: Record<string, unknown> | null;

  /** Whether this step is optional (can be skipped by authorized users) */
  @Column({ name: 'is_optional', default: false })
  isOptional: boolean;
}
