import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull, In } from 'typeorm';
import { Cache } from 'cache-manager';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Inject } from '@nestjs/common';

import { UserRoleAssignment } from '../entities/user-role-assignment.entity';
import { Permission } from '../entities/permission.entity';
import { Role } from '../entities/role.entity';
import { Delegation } from '../entities/delegation.entity';
import { OrgService } from '../../org/services/org.service';
import { CreateRoleDto } from '../dto/create-role.dto';

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

export interface AuthzDecision {
  allowed: boolean;
  reason: string;
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
    @Inject(CACHE_MANAGER)
    private readonly cache: Cache,
    private readonly orgService: OrgService,
  ) {}

  /**
   * Primary authorization entry point.
   * Evaluates all four layers and returns a single allow/deny decision.
   *
   * Layer 1: RBAC — does the user's role grant this capability?
   * Layer 2: Scope — does the user's positional authority cover this department?
   * Layer 3: Classification — does the user's clearance meet the resource's classification?
   * Layer 4: Context — active delegations, acting assignments, emergency overrides?
   */
  async can(permission: string, context: AuthzContext): Promise<AuthzDecision> {
    const { userId, departmentId, resourceClassification, userClearance } = context;

    // Layer 3: Classification check first (hard ceiling)
    if (
      resourceClassification !== undefined &&
      userClearance !== undefined &&
      userClearance < resourceClassification
    ) {
      return {
        allowed: false,
        reason: `User clearance level ${userClearance} insufficient for resource classification ${resourceClassification}`,
      };
    }

    // Layer 1 + 2: RBAC with scope
    const hasDirect = await this.checkRbacWithScope(userId, permission, departmentId);
    if (hasDirect.allowed) return hasDirect;

    // Layer 4: Check active delegations — is user acting on behalf of someone
    // who has this permission?
    const hasDelegated = await this.checkDelegatedPermission(userId, permission, departmentId);
    if (hasDelegated.allowed) return hasDelegated;

    return {
      allowed: false,
      reason: `Permission '${permission}' not granted to user ${userId}`,
    };
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
      (a) =>
        !a.expiresAt || a.expiresAt > now,
    );

    for (const assignment of activeAssignments) {
      // Layer 2: Scope check
      if (departmentId && assignment.departmentScopeId) {
        const inScope = await this.isDepartmentInScope(
          departmentId,
          assignment.departmentScopeId,
        );
        if (!inScope) continue;
      }

      // Layer 1: RBAC check — direct + inherited via parent role
      const hasPermission = await this.roleHasPermission(assignment.role, permission, new Set());
      if (hasPermission) {
        const decision: AuthzDecision = {
          allowed: true,
          reason: `Role '${assignment.role.name}' grants permission '${permission}'`,
        };
        await this.cache.set(cacheKey, decision, AUTHZ_CACHE_TTL);
        return decision;
      }
    }

    const denied: AuthzDecision = { allowed: false, reason: 'No matching role grants this permission' };
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

    const delegations = await this.delegationRepo.find({
      where: { delegateId: userId, revokedAt: IsNull() },
    });

    const active = delegations.filter(
      (d) => d.startAt <= now && d.endAt >= now,
    );

    for (const delegation of active) {
      const principalDecision = await this.checkRbacWithScope(
        delegation.delegatorId,
        permission,
        departmentId,
      );
      if (principalDecision.allowed) {
        return {
          allowed: true,
          reason: `Delegated permission from user ${delegation.delegatorId} via position ${delegation.positionId}`,
        };
      }
    }

    return { allowed: false, reason: 'No delegation grants this permission' };
  }

  async invalidateUserCache(userId: string): Promise<void> {
    // In production, use cache tag invalidation. For now, we rely on TTL expiry.
    this.logger.debug(`Cache invalidation requested for user ${userId}`);
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

  async createRole(dto: CreateRoleDto): Promise<Role> {
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

    return this.roleRepo.save(role);
  }

  async deleteRole(id: string): Promise<boolean> {
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
    return true;
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
