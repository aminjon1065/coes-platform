import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

/**
 * Immutable, append-only log of every significant action on a document's workflow.
 * Business-visible (supervisors/department heads can read it for documents in their scope).
 * Distinct from the platform-level Audit Log (security infrastructure).
 */
@Entity({ name: 'workflow_history', schema: 'edms' })
@Index(['documentId', 'createdAt'])
@Index(['instanceId'])
export class WorkflowHistory {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'document_id' })
  documentId: string;

  @Column({ type: 'varchar',  name: 'instance_id', nullable: true })
  instanceId: string | null;

  @Column({ type: 'varchar',  name: 'step_id', nullable: true })
  stepId: string | null;

  /** Type of event: "step_activated", "step_completed", "step_returned", "resolution_issued", "escalated", etc. */
  @Column({ name: 'event_type', length: 100 })
  eventType: string;

  @Column({ type: 'varchar',  name: 'actor_id', nullable: true })
  actorId: string | null;

  @Column({ type: 'varchar',  name: 'actor_position_id', nullable: true })
  actorPositionId: string | null;

  /**
   * Delegation ID if actor was acting under delegation — permanently linked for attribution.
   */
  @Column({ type: 'varchar',  name: 'delegation_id', nullable: true })
  delegationId: string | null;

  /** Structured event data (previous state, new state, etc.) */
  @Column({ type: 'jsonb', nullable: true })
  payload: Record<string, unknown> | null;

  /** Human-readable remarks from the actor */
  @Column({ type: 'text', nullable: true })
  remarks: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
