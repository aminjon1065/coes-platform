import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

/**
 * Layer 4: Contextual Policy — time-bound delegation of authority.
 * A user can delegate their positional authority to another user for a period.
 * Delegates cannot re-delegate (enforced at service layer).
 */
@Entity({ name: 'delegations', schema: 'authz' })
@Index(['delegatorId', 'startAt', 'endAt'])
export class Delegation {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'delegator_id' })
  delegatorId: string;

  @Column({ name: 'delegate_id' })
  delegateId: string;

  @Column({ name: 'position_id' })
  positionId: string;

  @Column({ name: 'start_at', type: 'timestamptz' })
  startAt: Date;

  @Column({ name: 'end_at', type: 'timestamptz' })
  endAt: Date;

  @Column({ length: 500, nullable: true })
  reason: string | null;

  @Column({ name: 'created_by_id', nullable: true })
  createdById: string | null;

  @Column({ name: 'revoked_at', type: 'timestamptz', nullable: true })
  revokedAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
