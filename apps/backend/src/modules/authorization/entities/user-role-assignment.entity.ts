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
 * Assigns a role to a user, optionally scoped to a specific department.
 * A user can hold multiple roles with different department scopes.
 */
@Entity({ name: 'user_role_assignments', schema: 'authz' })
@Index(['userId', 'roleId'])
export class UserRoleAssignment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @Column({ name: 'role_id', type: 'uuid' })
  roleId: string;

  @ManyToOne(() => Role, { eager: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'role_id' })
  role: Role;

  // Optional: restrict this role assignment to a specific department scope
  @Column({ name: 'department_scope_id', type: 'uuid', nullable: true })
  departmentScopeId: string | null;

  // Optional: restrict this role assignment to a specific position
  @Column({ name: 'position_id', type: 'uuid', nullable: true })
  positionId: string | null;

  @Column({ name: 'granted_by_id', type: 'uuid', nullable: true })
  grantedById: string | null;

  @Column({ name: 'expires_at', type: 'timestamptz', nullable: true })
  expiresAt: Date | null;

  @Column({ name: 'revoked_at', type: 'timestamptz', nullable: true })
  revokedAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
