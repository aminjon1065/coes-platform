import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Role } from './role.entity';

/**
 * Section 6.1 — Positional Roles (Computed, Not Manually Assigned)
 *
 * Links an organizational position to a role.
 * When a user occupies a position (primary, acting, or concurrent),
 * ALL roles on that position become active for them automatically.
 * When they vacate the position, those roles are deactivated.
 *
 * This is distinct from UserRoleAssignment (functional roles that are
 * manually assigned to specific users beyond their positional authority).
 */
@Entity({ name: 'position_roles', schema: 'authz' })
@Index(['positionId', 'roleId'], { unique: true })
export class PositionRole {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** FK to org.positions.id — no TypeORM relation (cross-schema) */
  @Column({ name: 'position_id', type: 'uuid' })
  positionId: string;

  @Column({ name: 'role_id', type: 'uuid' })
  roleId: string;

  @ManyToOne(() => Role, { eager: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'role_id' })
  role: Role;

  /** Who made this assignment — org_admin or security_admin */
  @Column({ name: 'granted_by_id', type: 'uuid', nullable: true })
  grantedById: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
