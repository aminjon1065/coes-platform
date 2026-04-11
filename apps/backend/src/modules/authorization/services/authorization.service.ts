import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository, InjectDataSource } from '@nestjs/typeorm';
import { Repository, IsNull, In, DataSource } from 'typeorm';
import { Cache } from 'cache-manager';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Inject } from '@nestjs/common';

import { UserRoleAssignment } from '../entities/user-role-assignment.entity';
import { Permission } from '../entities/permission.entity';
import { Role } from '../entities/role.entity';
import { Delegation, DelegationStatus } from '../entities/delegation.entity';
import { PositionRole } from '../entities/position-role.entity';
import { SodRule } from '../entities/sod-rule.entity';
import { OrgService } from '../../org/services/org.service';
import { CreateRoleDto } from '../dto/create-role.dto';
import { AssignUserRoleDto } from '../dto/assign-user-role.dto';
import { AuditService } from '../../audit/services/audit.service';
import { AuditSeverity } from '../../audit/entities/audit-event.entity';

const AUTHZ_CACHE_TTL = 60; // seconds
const CACHE_KEY_PREFIX = 'authz:';

export interface AuthzContext {
  userId: string;
  /** The department in which the action is performed */
  departmentId?: string;
  /** Classification level of the target resource (0 = public, higher = more sensitive) */
  resourceClassification?: number;
  /** Classification clearance of the requesting user */
  userClearance?: number;
}

/** Section 12.3 — structured explainability for every access decision */
export type AuthzDeniedLayer = 'CAPABILITY' | 'SCOPE' | 'CLASSIFICATION' | 'POLICY';

export interface AuthzDecision {
  allowed: boolean;
  reason: string;
  /** Which layer denied the request (only set when allowed === false) */
  deniedLayer?: AuthzDeniedLayer;
  /** The role that granted access (only set when allowed === true) */
  grantedByRole?: string;
  /** The delegation ID that expanded scope (only set when allowed via delegation) */
  delegationRef?: string;
  /** The position from which authority was derived (positional role path) */
  positionRef?: string;
}

export interface SodViolation {
  ruleId: string;
  conflictingRoleId: string;
  conflictingRoleName: string;
  description: string;
}

export interface PositionRoleSummary {
  positionId: string;
  roleId: string;
  roleName: string;
  grantedById: string | null;
  createdAt: Date;
}

export interface PortalWorkspaceSummary {
  key: 'core' | 'analytics' | 'admin';
  label: string;
  description: string;
}

export interface PortalRoleAssignmentSummary {
  id: string;
  roleId: string;
  roleName: string;
  departmentScopeId: string | null;
  positionId: string | null;
  expiresAt: Date | null;
}

export interface PortalContextSummary {
  roles: PortalRoleAssignmentSummary[];
  capabilities: string[];
  workspaces: PortalWorkspaceSummary[];
}

export interface UserRoleAssignmentSummary {
  id: string;
  userId: string;
  roleId: string;
  roleName: string;
  departmentScopeId: string | null;
  positionId: string | null;
  grantedById: string | null;
  expiresAt: Date | null;
  revokedAt: Date | null;
  createdAt: Date;
}

@Injectable()
export class AuthorizationService {
  private readonly logger = new Logger(AuthorizationService.name);

  constructor(
    @InjectRepository(UserRoleAssignment)
    private readonly assignmentRepo: Repository<UserRoleAssignment>,
    @InjectRepository(Role)
    private readonly roleRepo: Repository<Role>,
    @InjectRepository(Permission)
    private readonly permRepo: Repository<Permission>,
    @InjectRepository(Delegation)
    private readonly delegationRepo: Repository<Delegation>,
    @InjectRepository(PositionRole)
    private readonly positionRoleRepo: Repository<PositionRole>,
    @InjectRepository(SodRule)
    private readonly sodRuleRepo: Repository<SodRule>,
    @InjectDataSource()
    private readonly dataSource: DataSource,
    @Inject(CACHE_MANAGER)
    private readonly cache: Cache,
    private readonly orgService: OrgService,
    private readonly auditService: AuditService,
  ) {}

  /**
   * Primary authorization entry point.
   * Evaluates all four layers and returns a structured allow/deny decision.
   *
   * Layer 1: RBAC — does the user's role (functional or positional) grant this capability?
   * Layer 2: Scope — does the user's positional authority cover this department?
   * Layer 3: Classification — does the user's clearance meet the resource's classification?
   * Layer 4: Context — active delegations, acting assignments, emergency overrides?
   *
   * Section 12.3 — every decision carries a reasoning chain for explainability.
   */
  async can(permission: string, context: AuthzContext): Promise<AuthzDecision> {
    const { userId, departmentId, resourceClassification, userClearance } = context;

    // Layer 3 first — hard ceiling, no exceptions by role or scope (§3.2 Layer 3)
    if (
      resourceClassification !== undefined &&
      userClearance !== undefined &&
      userClearance < resourceClassification
    ) {
      return {
        allowed: false,
        deniedLayer: 'CLASSIFICATION',
        reason: `User clearance level ${userClearance} is below resource classification ${resourceClassification}. No role or delegation can override this.`,
      };
    }

    // Layer 1 + 2: RBAC (functional roles) + scope
    const hasDirect = await this.checkRbacWithScope(userId, permission, departmentId);
    if (hasDirect.allowed) return hasDirect;

    // Layer 1 + 2: Positional roles (auto-derived from active position occupancies, §6.1)
    const hasPositional = await this.checkPositionalRoles(userId, permission, departmentId);
    if (hasPositional.allowed) return hasPositional;

    // Layer 4: Active delegation grants
    const hasDelegated = await this.checkDelegatedPermission(userId, permission, departmentId);
    if (hasDelegated.allowed) return hasDelegated;

    return {
      allowed: false,
      deniedLayer: hasDirect.deniedLayer ?? 'CAPABILITY',
      reason: `Permission '${permission}' not granted to user ${userId} via any functional role, positional role, or active delegation.`,
    };
  }

  /**
   * Check positional roles: for every active position occupancy of this user,
   * look up authz.position_roles and evaluate as if those were direct role assignments.
   * The position's owning department is used as the implicit scope. §6.1
   */
  private async checkPositionalRoles(
    userId: string,
    permission: string,
    departmentId?: string,
  ): Promise<AuthzDecision> {
    // Fetch active position occupancies from users schema (cross-schema raw query)
    const occupancies: Array<{ position_id: string; department_id: string | null }> =
      await this.dataSource.query(
        `SELECT pa.position_id, p.department_id
           FROM users.user_position_assignments pa
           JOIN org.positions p ON p.id = pa.position_id
          WHERE pa.user_id = $1
            AND pa.vacated_at IS NULL`,
        [userId],
      );

    if (!occupancies.length) {
      return { allowed: false, reason: 'User holds no active position' };
    }

    for (const occ of occupancies) {
      // Scope check: if a departmentId is requested, the position must cover it
      if (departmentId && occ.department_id) {
        const inScope = await this.isDepartmentInScope(departmentId, occ.department_id);
        if (!inScope) continue;
      }

      // Fetch all roles on this position
      const posRoles = await this.positionRoleRepo.find({
        where: { positionId: occ.position_id },
        relations: ['role', 'role.permissions'],
      });

      for (const pr of posRoles) {
        const hasPermission = await this.roleHasPermission(pr.role, permission, new Set());
        if (hasPermission) {
          return {
            allowed: true,
            grantedByRole: pr.role.name,
            positionRef: occ.position_id,
            reason: `Positional role '${pr.role.name}' on position ${occ.position_id} grants '${permission}'`,
          };
        }
      }
    }

    return { allowed: false, deniedLayer: 'CAPABILITY', reason: 'No positional role grants this permission' };
  }

  private async checkRbacWithScope(
    userId: string,
    permission: string,
    departmentId?: string,
  ): Promise<AuthzDecision> {
    const cacheKey = `${CACHE_KEY_PREFIX}${userId}:${permission}:${departmentId ?? '*'}`;
    const cached = await this.cache.get<AuthzDecision>(cacheKey);
    if (cached !== undefined && cached !== null) return cached;

    const now = new Date();

    const assignments = await this.assignmentRepo.find({
      where: { userId, revokedAt: IsNull() },
      relations: ['role', 'role.permissions'],
    });

    const activeAssignments = assignments.filter(
      (a) => !a.expiresAt || a.expiresAt > now,
    );

    let capabilityFound = false;

    for (const assignment of activeAssignments) {
      // Layer 1: Can this role even do this action? (fast check before scope)
      const hasCapability = await this.roleHasPermission(assignment.role, permission, new Set());
      if (!hasCapability) continue;
      capabilityFound = true;

      // Layer 2: Scope check
      if (departmentId && assignment.departmentScopeId) {
        const inScope = await this.isDepartmentInScope(departmentId, assignment.departmentScopeId);
        if (!inScope) continue;
      }

      const decision: AuthzDecision = {
        allowed: true,
        grantedByRole: assignment.role.name,
        reason: `Role '${assignment.role.name}' grants permission '${permission}'${departmentId ? ` within department scope` : ''}`,
      };
      await this.cache.set(cacheKey, decision, AUTHZ_CACHE_TTL);
      return decision;
    }

    const denied: AuthzDecision = {
      allowed: false,
      deniedLayer: capabilityFound ? 'SCOPE' : 'CAPABILITY',
      reason: capabilityFound
        ? `Role grants '${permission}' but department ${departmentId} is outside assigned scope`
        : 'No functional role grants this permission',
    };
    await this.cache.set(cacheKey, denied, AUTHZ_CACHE_TTL);
    return denied;
  }

  private async roleHasPermission(
    role: Role,
    permission: string,
    visited: Set<string>,
  ): Promise<boolean> {
    if (visited.has(role.id)) return false;
    visited.add(role.id);

    // Direct permission check
    if (role.permissions.some((p) => p.name === permission)) return true;

    // Inherited from parent role
    if (role.parentRoleId) {
      const parent = await this.roleRepo.findOne({
        where: { id: role.parentRoleId },
        relations: ['permissions'],
      });
      if (parent) return this.roleHasPermission(parent, permission, visited);
    }

    return false;
  }

  private async isDepartmentInScope(
    targetDeptId: string,
    scopeDeptId: string,
  ): Promise<boolean> {
    if (targetDeptId === scopeDeptId) return true;
    // Check if scopeDeptId is an ancestor of targetDeptId
    const ancestors = await this.orgService.getDescendants(scopeDeptId);
    return ancestors.some((d) => d.id === targetDeptId);
  }

  private async checkDelegatedPermission(
    userId: string,
    permission: string,
    departmentId?: string,
  ): Promise<AuthzDecision> {
    const now = new Date();

    // Use status field (new) + fallback on revokedAt for backward compatibility
    const delegations = await this.delegationRepo.find({
      where: [
        { delegateId: userId, status: DelegationStatus.ACTIVE },
        { delegateId: userId, revokedAt: IsNull() },
      ],
    });

    const active = delegations.filter(
      (d) => d.startAt <= now && d.endAt >= now && !d.revokedAt,
    );

    for (const delegation of active) {
      // Delegation is scope expansion only — never clearance elevation (§8.3)
      // Check if the delegator has this permission
      const principalDecision = await this.checkRbacWithScope(
        delegation.delegatorId,
        permission,
        departmentId,
      );
      if (!principalDecision.allowed) {
        // Also check delegator's positional roles
        const positionalDecision = await this.checkPositionalRoles(
          delegation.delegatorId,
          permission,
          departmentId,
        );
        if (!positionalDecision.allowed) continue;
      }

      return {
        allowed: true,
        delegationRef: delegation.id,
        reason: `Delegated authority from user ${delegation.delegatorId} via delegation ${delegation.id} (${delegation.authorityType ?? 'legacy'})`,
      };
    }

    return { allowed: false, deniedLayer: 'POLICY', reason: 'No active delegation grants this permission' };
  }

  /**
   * Immediately invalidate all cached authz decisions for a user.
   * Uses the underlying Redis client's SCAN+DEL to remove all keys matching
   * the user's prefix — required by §8.6 (delegation revocation must take effect
   * immediately, not after TTL expiry).
   */
  async invalidateUserCache(userId: string): Promise<void> {
    const pattern = `${CACHE_KEY_PREFIX}${userId}:*`;
    try {
      // cache-manager-ioredis-yet exposes the ioredis client on .store.client
      const redisClient = (this.cache.store as any)?.client;
      if (redisClient && typeof redisClient.keys === 'function') {
        const keys: string[] = await redisClient.keys(pattern);
        if (keys.length > 0) {
          await redisClient.del(...keys);
          this.logger.debug(`Invalidated ${keys.length} cache keys for user ${userId}`);
        }
      } else {
        this.logger.debug(`Cache store does not expose Redis client — relying on TTL for user ${userId}`);
      }
    } catch (err) {
      // Cache invalidation failure must never break the operation that triggered it
      this.logger.warn(`Cache invalidation failed for user ${userId}: ${(err as Error).message}`);
    }
  }

  async listRoles(): Promise<Role[]> {
    return this.roleRepo.find({
      relations: ['permissions'],
      order: { name: 'ASC' },
    });
  }

  async listCapabilities(): Promise<string[]> {
    const permissions = await this.permRepo.find({
      order: { domain: 'ASC', resource: 'ASC', action: 'ASC', name: 'ASC' },
    });
    return permissions.map((permission) => permission.name);
  }

  async createRole(dto: CreateRoleDto, actorId?: string): Promise<Role> {
    const existing = await this.roleRepo.findOne({ where: { name: dto.name } });
    if (existing) {
      throw new ConflictException(`Role '${dto.name}' already exists`);
    }

    let parentRole: Role | null = null;
    if (dto.parentRoleId) {
      parentRole = await this.roleRepo.findOne({ where: { id: dto.parentRoleId } });
      if (!parentRole) {
        throw new NotFoundException(`Parent role ${dto.parentRoleId} not found`);
      }
    }

    const permissionNames = [...new Set(dto.permissionNames ?? [])];
    const permissions = permissionNames.length
      ? await this.permRepo.find({ where: { name: In(permissionNames) } })
      : [];

    if (permissions.length !== permissionNames.length) {
      const found = new Set(permissions.map((permission) => permission.name));
      const missing = permissionNames.filter((permission) => !found.has(permission));
      throw new BadRequestException(`Unknown permissions: ${missing.join(', ')}`);
    }

    const role = this.roleRepo.create({
      name: dto.name,
      description: dto.description ?? null,
      parentRoleId: parentRole?.id ?? null,
      isSystemRole: false,
      permissions,
    });

    const saved = await this.roleRepo.save(role);
    await this.auditService.emit({
      actorId,
      eventType: 'admin.role.created',
      resourceType: 'role',
      resourceId: saved.id,
      success: true,
      severity: AuditSeverity.INFO,
      metadata: {
        name: saved.name,
        permissionNames,
        parentRoleId: saved.parentRoleId,
      },
    });

    return saved;
  }

  async deleteRole(id: string, actorId?: string): Promise<boolean> {
    const role = await this.roleRepo.findOne({ where: { id } });
    if (!role) {
      throw new NotFoundException(`Role ${id} not found`);
    }

    if (role.isSystemRole) {
      throw new BadRequestException('System roles cannot be deleted');
    }

    const activeAssignments = await this.assignmentRepo.count({
      where: { roleId: id, revokedAt: IsNull() },
    });
    if (activeAssignments > 0) {
      throw new BadRequestException('Role has active assignments and cannot be deleted');
    }

    await this.roleRepo.delete(id);
    await this.auditService.emit({
      actorId,
      eventType: 'admin.role.deleted',
      resourceType: 'role',
      resourceId: id,
      success: true,
      severity: AuditSeverity.WARNING,
    });
    return true;
  }

  async listUserRoleAssignments(userId: string): Promise<UserRoleAssignmentSummary[]> {
    const assignments = await this.assignmentRepo.find({
      where: { userId, revokedAt: IsNull() },
      relations: ['role'],
      order: { createdAt: 'DESC' },
    });

    return assignments.map((assignment) => ({
      id: assignment.id,
      userId: assignment.userId,
      roleId: assignment.roleId,
      roleName: assignment.role.name,
      departmentScopeId: assignment.departmentScopeId,
      positionId: assignment.positionId,
      grantedById: assignment.grantedById,
      expiresAt: assignment.expiresAt,
      revokedAt: assignment.revokedAt,
      createdAt: assignment.createdAt,
    }));
  }

  // ── Positional Role Management (§6.1) ────────────────────────────────────

  async assignRoleToPosition(
    positionId: string,
    roleId: string,
    actorId: string,
  ): Promise<PositionRoleSummary> {
    const role = await this.roleRepo.findOne({ where: { id: roleId } });
    if (!role) throw new NotFoundException(`Role ${roleId} not found`);

    const existing = await this.positionRoleRepo.findOne({ where: { positionId, roleId } });
    if (existing) throw new ConflictException('Position already has this role');

    const saved = await this.positionRoleRepo.save(
      this.positionRoleRepo.create({ positionId, roleId, grantedById: actorId }),
    );

    await this.auditService.emit({
      actorId,
      eventType: 'admin.position_role.assigned',
      resourceType: 'position-role',
      resourceId: saved.id,
      success: true,
      severity: AuditSeverity.INFO,
      metadata: { positionId, roleId, roleName: role.name },
    });

    return {
      positionId: saved.positionId,
      roleId: saved.roleId,
      roleName: role.name,
      grantedById: saved.grantedById,
      createdAt: saved.createdAt,
    };
  }

  async revokeRoleFromPosition(
    positionId: string,
    roleId: string,
    actorId: string,
  ): Promise<void> {
    const record = await this.positionRoleRepo.findOne({ where: { positionId, roleId } });
    if (!record) throw new NotFoundException('Position does not have this role');

    await this.positionRoleRepo.delete(record.id);

    // Invalidate all users currently occupying this position
    const occupants: Array<{ user_id: string }> = await this.dataSource.query(
      `SELECT DISTINCT user_id FROM users.user_position_assignments
        WHERE position_id = $1 AND vacated_at IS NULL`,
      [positionId],
    );
    await Promise.all(occupants.map((o) => this.invalidateUserCache(o.user_id)));

    await this.auditService.emit({
      actorId,
      eventType: 'admin.position_role.revoked',
      resourceType: 'position-role',
      resourceId: record.id,
      success: true,
      severity: AuditSeverity.WARNING,
      metadata: { positionId, roleId },
    });
  }

  async listRolesForPosition(positionId: string): Promise<PositionRoleSummary[]> {
    const records = await this.positionRoleRepo.find({
      where: { positionId },
      relations: ['role'],
      order: { createdAt: 'ASC' },
    });
    return records.map((r) => ({
      positionId: r.positionId,
      roleId: r.roleId,
      roleName: r.role.name,
      grantedById: r.grantedById,
      createdAt: r.createdAt,
    }));
  }

  // ── SoD Rule Management (§9) ──────────────────────────────────────────────

  async createSodRule(
    roleAId: string,
    roleBId: string,
    description: string,
    actorId: string,
  ): Promise<SodRule> {
    const [roleA, roleB] = await Promise.all([
      this.roleRepo.findOne({ where: { id: roleAId } }),
      this.roleRepo.findOne({ where: { id: roleBId } }),
    ]);
    if (!roleA) throw new NotFoundException(`Role ${roleAId} not found`);
    if (!roleB) throw new NotFoundException(`Role ${roleBId} not found`);
    if (roleAId === roleBId) throw new BadRequestException('SoD rule must reference two distinct roles');

    // Normalise order for unique constraint
    const [normalA, normalB] = [roleAId, roleBId].sort();

    const existing = await this.sodRuleRepo.findOne({ where: { roleAId: normalA, roleBId: normalB } });
    if (existing) throw new ConflictException('SoD rule for this pair already exists');

    const saved = await this.sodRuleRepo.save(
      this.sodRuleRepo.create({
        roleAId: normalA,
        roleBId: normalB,
        description,
        createdById: actorId,
        active: true,
      }),
    );

    await this.auditService.emit({
      actorId,
      eventType: 'admin.sod_rule.created',
      resourceType: 'sod-rule',
      resourceId: saved.id,
      success: true,
      severity: AuditSeverity.WARNING,
      metadata: { roleAId: normalA, roleBId: normalB, description },
    });

    return saved;
  }

  async listSodRules(): Promise<SodRule[]> {
    return this.sodRuleRepo.find({ where: { active: true }, order: { createdAt: 'ASC' } });
  }

  /**
   * Preventive SoD check — called before assignRoleToUser().
   * Returns a violation record if adding this role to this user would breach any SoD rule.
   */
  async checkSodViolation(userId: string, newRoleId: string): Promise<SodViolation | null> {
    const activeRules = await this.sodRuleRepo.find({ where: { active: true } });

    // Collect the user's currently active role IDs (functional + positional)
    const now = new Date();
    const functional = await this.assignmentRepo.find({
      where: { userId, revokedAt: IsNull() },
    });
    const activeRoleIds = new Set(
      functional
        .filter((a) => !a.expiresAt || a.expiresAt > now)
        .map((a) => a.roleId),
    );

    for (const rule of activeRules) {
      const otherRoleId =
        rule.roleAId === newRoleId ? rule.roleBId :
        rule.roleBId === newRoleId ? rule.roleAId :
        null;

      if (!otherRoleId) continue;

      if (activeRoleIds.has(otherRoleId)) {
        const conflictRole = await this.roleRepo.findOne({ where: { id: otherRoleId } });
        return {
          ruleId: rule.id,
          conflictingRoleId: otherRoleId,
          conflictingRoleName: conflictRole?.name ?? otherRoleId,
          description: rule.description,
        };
      }
    }

    return null;
  }

  async assignRoleToUser(
    actorId: string,
    userId: string,
    dto: AssignUserRoleDto,
  ): Promise<UserRoleAssignmentSummary> {
    const role = await this.roleRepo.findOne({ where: { id: dto.roleId } });
    if (!role) {
      throw new NotFoundException(`Role ${dto.roleId} not found`);
    }

    // Preventive SoD check (§9.4) — reject before persisting
    const sodViolation = await this.checkSodViolation(userId, dto.roleId);
    if (sodViolation) {
      await this.auditService.emit({
        actorId,
        eventType: 'admin.sod_violation.prevented',
        resourceType: 'user-role-assignment',
        resourceId: userId,
        success: false,
        severity: AuditSeverity.WARNING,
        metadata: { userId, newRoleId: dto.roleId, ...sodViolation },
      });
      throw new BadRequestException(
        `Role assignment rejected: SoD violation. Assigning '${role.name}' would conflict with existing role '${sodViolation.conflictingRoleName}'. Rule: ${sodViolation.description}`,
      );
    }

    const existingWhere: {
      userId: string;
      roleId: string;
      revokedAt: ReturnType<typeof IsNull>;
      departmentScopeId?: string;
      positionId?: string;
    } = {
      userId,
      roleId: dto.roleId,
      revokedAt: IsNull(),
    };

    if (dto.departmentScopeId) {
      existingWhere.departmentScopeId = dto.departmentScopeId;
    }

    if (dto.positionId) {
      existingWhere.positionId = dto.positionId;
    }

    const existing = await this.assignmentRepo.findOne({
      where: existingWhere,
      relations: ['role'],
    });

    if (existing) {
      throw new ConflictException('Matching active role assignment already exists');
    }

    const assignment = await this.assignmentRepo.save(
      this.assignmentRepo.create({
        userId,
        roleId: dto.roleId,
        departmentScopeId: dto.departmentScopeId ?? null,
        positionId: dto.positionId ?? null,
        grantedById: actorId,
        expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
      }),
    );

    const saved = await this.assignmentRepo.findOne({
      where: { id: assignment.id },
      relations: ['role'],
    });

    if (!saved) {
      throw new NotFoundException(`Assignment ${assignment.id} not found after creation`);
    }

    await this.auditService.emit({
      actorId,
      eventType: 'admin.user_role.assigned',
      resourceType: 'user-role-assignment',
      resourceId: saved.id,
      success: true,
      severity: AuditSeverity.INFO,
      metadata: {
        userId,
        roleId: saved.roleId,
        departmentScopeId: saved.departmentScopeId,
        positionId: saved.positionId,
        expiresAt: saved.expiresAt,
      },
    });

    return {
      id: saved.id,
      userId: saved.userId,
      roleId: saved.roleId,
      roleName: saved.role.name,
      departmentScopeId: saved.departmentScopeId,
      positionId: saved.positionId,
      grantedById: saved.grantedById,
      expiresAt: saved.expiresAt,
      revokedAt: saved.revokedAt,
      createdAt: saved.createdAt,
    };
  }

  async revokeUserRoleAssignment(actorId: string, userId: string, assignmentId: string): Promise<void> {
    const assignment = await this.assignmentRepo.findOne({
      where: { id: assignmentId, userId, revokedAt: IsNull() },
    });

    if (!assignment) {
      throw new NotFoundException(`Assignment ${assignmentId} not found`);
    }

    await this.assignmentRepo.update(assignmentId, {
      revokedAt: new Date(),
      grantedById: assignment.grantedById ?? actorId,
    });
    await this.invalidateUserCache(userId);
    await this.auditService.emit({
      actorId,
      eventType: 'admin.user_role.revoked',
      resourceType: 'user-role-assignment',
      resourceId: assignmentId,
      success: true,
      severity: AuditSeverity.WARNING,
      metadata: {
        userId,
        roleId: assignment.roleId,
      },
    });
  }

  async getPortalContextForUser(userId: string): Promise<PortalContextSummary> {
    const now = new Date();
    const assignments = await this.assignmentRepo.find({
      where: { userId, revokedAt: IsNull() },
      relations: ['role', 'role.permissions'],
      order: { createdAt: 'ASC' },
    });

    const activeAssignments = assignments.filter((assignment) => !assignment.expiresAt || assignment.expiresAt > now);
    const capabilitySet = new Set<string>();

    for (const assignment of activeAssignments) {
      const permissions = await this.collectRolePermissions(assignment.role, new Set());
      for (const permission of permissions) {
        capabilitySet.add(permission);
      }
    }

    const capabilities = [...capabilitySet].sort((left, right) => left.localeCompare(right));
    const roles = activeAssignments.map((assignment) => ({
      id: assignment.id,
      roleId: assignment.roleId,
      roleName: assignment.role.name,
      departmentScopeId: assignment.departmentScopeId,
      positionId: assignment.positionId,
      expiresAt: assignment.expiresAt,
    })) satisfies PortalRoleAssignmentSummary[];

    return {
      roles,
      capabilities,
      workspaces: this.derivePortalWorkspaces(capabilities),
    };
  }

  private async collectRolePermissions(role: Role, visited: Set<string>): Promise<Set<string>> {
    const collected = new Set<string>();
    await this.collectRolePermissionsInto(role, visited, collected);
    return collected;
  }

  private async collectRolePermissionsInto(
    role: Role,
    visited: Set<string>,
    collected: Set<string>,
  ): Promise<void> {
    if (visited.has(role.id)) {
      return;
    }

    visited.add(role.id);
    for (const permission of role.permissions) {
      collected.add(permission.name);
    }

    if (!role.parentRoleId) {
      return;
    }

    const parent = await this.roleRepo.findOne({
      where: { id: role.parentRoleId },
      relations: ['permissions'],
    });
    if (parent) {
      await this.collectRolePermissionsInto(parent, visited, collected);
    }
  }

  private derivePortalWorkspaces(capabilities: string[]): PortalWorkspaceSummary[] {
    const workspaces: PortalWorkspaceSummary[] = [
      {
        key: 'core',
        label: 'Core Workspace',
        description: 'Tasks, EDMS, files, notifications, chat, and shared operational tools.',
      },
    ];

    const hasAdminWorkspace = capabilities.some((capability) =>
      capability.startsWith('iam.') ||
      capability.startsWith('org.') ||
      capability.startsWith('authz.') ||
      capability.startsWith('search.admin.'),
    );
    if (hasAdminWorkspace) {
      workspaces.push({
        key: 'admin',
        label: 'Admin Workspace',
        description: 'Control plane for users, roles, departments, monitoring, and platform operations.',
      });
    }

    const hasAnalyticsWorkspace = capabilities.some((capability) =>
      capability.startsWith('analytics.') ||
      capability.startsWith('gis.') ||
      (capability.startsWith('search.') && !capability.startsWith('search.admin.')),
    );
    if (hasAnalyticsWorkspace) {
      workspaces.push({
        key: 'analytics',
        label: 'Analytics Workspace',
        description: 'Geo-intelligence, cross-domain search, and analytical investigation flows.',
      });
    }

    return workspaces;
  }
}
