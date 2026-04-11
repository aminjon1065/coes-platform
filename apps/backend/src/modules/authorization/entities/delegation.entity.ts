import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

/**
 * Delegation authority types (Section 8.2 — What Can Be Delegated).
 * Administrative and security capabilities are NOT delegatable (Section 8.3).
 */
export enum DelegationAuthorityType {
  /** Delegate authority to assign tasks within a defined scope */
  TASK_ASSIGNMENT = 'task_assignment',
  /** Delegate document approval authority for a specific type/classification */
  DOCUMENT_APPROVAL = 'document_approval',
  /** Delegate document routing and signing authority */
  DOCUMENT_ROUTING = 'document_routing',
  /**
   * Acting assignment — full positional authority transfer for an absent position holder.
   * Requires counter-authorization by a superior (authorizedById must be set).
   */
  ACTING_ASSIGNMENT = 'acting_assignment',
  /** Delegate access to own resources in a module for monitoring purposes */
  MODULE_ACCESS = 'module_access',
}

export enum DelegationStatus {
  ACTIVE = 'active',
  EXPIRED = 'expired',
  REVOKED = 'revoked',
}

/**
 * Layer 4: Contextual Policy — time-bound delegation of authority (Section 8.4).
 *
 * A user delegates a subset of their authority to another user for a bounded period.
 * Delegates CANNOT re-delegate (P8).
 * Delegation is scope expansion only — never clearance elevation (Section 8.3).
 * Open-ended delegations are not permitted — endAt is mandatory.
 */
@Entity({ name: 'delegations', schema: 'authz' })
@Index(['delegatorId', 'startAt', 'endAt'])
@Index(['delegateId', 'status'])
export class Delegation {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** The user granting authority — must currently hold the authority being delegated */
  @Column({ name: 'delegator_id', type: 'uuid' })
  delegatorId: string;

  /** The user receiving the authority */
  @Column({ name: 'delegate_id', type: 'uuid' })
  delegateId: string;

  /**
   * The position whose authority is being delegated.
   * For ACTING_ASSIGNMENT: the position being acted in.
   * For other types: the delegator's own position that holds the authority.
   */
  @Column({ name: 'position_id', type: 'uuid' })
  positionId: string;

  /** What specific authority is being delegated (Section 8.2) */
  @Column({
    name: 'authority_type',
    type: 'enum',
    enum: DelegationAuthorityType,
    enumName: 'delegation_authority_type',
  })
  authorityType: DelegationAuthorityType;

  /**
   * The scope within which the delegation applies.
   * Examples:
   *   { "departmentId": "uuid" }
   *   { "documentType": "resolution", "classificationMax": 2 }
   *   { "projectCode": "EMRG-2026-Q1" }
   */
  @Column({ type: 'jsonb', default: '{}' })
  scope: Record<string, unknown>;

  /** Mandatory start date/time */
  @Column({ name: 'start_at', type: 'timestamptz' })
  startAt: Date;

  /** Mandatory end date/time — open-ended delegations are not permitted (Section 8.4) */
  @Column({ name: 'end_at', type: 'timestamptz' })
  endAt: Date;

  /** Mandatory justification text — typically references leave approval or operational order */
  @Column({ length: 1000 })
  justification: string;

  /** Who authorized this delegation.
   * For routine delegations: same as delegatorId (self-authorized).
   * For ACTING_ASSIGNMENT: must be a superior position (P8 — must not be self-authorizing). */
  @Column({ name: 'authorized_by_id', type: 'uuid', nullable: true })
  authorizedById: string | null;

  @Column({ name: 'created_by_id', type: 'uuid', nullable: true })
  createdById: string | null;

  @Column({
    type: 'enum',
    enum: DelegationStatus,
    enumName: 'delegation_status',
    default: DelegationStatus.ACTIVE,
  })
  status: DelegationStatus;

  // ── Revocation fields (Section 8.6) ──────────────────────────────────────

  @Column({ name: 'revoked_at', type: 'timestamptz', nullable: true })
  revokedAt: Date | null;

  /** Who revoked this delegation */
  @Column({ name: 'revoked_by_id', type: 'uuid', nullable: true })
  revokedById: string | null;

  /** Why the delegation was revoked — significant if before natural expiry */
  @Column({ name: 'revocation_reason', type: 'varchar', length: 500, nullable: true })
  revocationReason: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
