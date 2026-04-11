import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

/**
 * Section 9 — Separation of Duties (SoD) Rules
 *
 * Defines pairs of roles that must NOT be held by the same user simultaneously.
 * Evaluated at role-assignment time (preventive) and by the governance audit scan
 * (detective).
 *
 * Examples from spec:
 *   user_admin  ↔  role_admin          (cannot create + assign roles alone)
 *   role_definer ↔ role_assigner        (cannot expand + assign roles alone)
 *   security_admin ↔ user_admin         (cannot configure clearances + create users)
 *   platform_admin ↔ audit_viewer       (cannot act + hide audit records)
 *
 * SoD rules are maintained by the security_admin. Adding/removing rules is audit-logged.
 */
@Entity({ name: 'sod_rules', schema: 'authz' })
@Index(['roleAId', 'roleBId'], { unique: true })
export class SodRule {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /**
   * The two roles that must not coexist on the same user.
   * Role A and Role B are symmetrical — order does not matter.
   * We normalise at insert time so roleAId < roleBId (alphabetically).
   */
  @Column({ name: 'role_a_id', type: 'uuid' })
  roleAId: string;

  @Column({ name: 'role_b_id', type: 'uuid' })
  roleBId: string;

  /** Human-readable justification for why these roles are incompatible */
  @Column({ length: 500 })
  description: string;

  /** Who created this SoD rule (must be security_admin) */
  @Column({ name: 'created_by_id', type: 'uuid', nullable: true })
  createdById: string | null;

  @Column({ default: true })
  active: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
