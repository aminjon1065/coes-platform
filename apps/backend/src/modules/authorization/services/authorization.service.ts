import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThanOrEqual, MoreThanOrEqual, IsNull } from 'typeorm';
import { Cache } from 'cache-manager';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Inject } from '@nestjs/common';

import { UserRoleAssignment } from '../entities/user-role-assignment.entity';
import { Permission } from '../entities/permission.entity';
import { Role } from '../entities/role.entity';
import { Delegation } from '../entities/delegation.entity';
import { OrgService } from '../../org/services/org.service';

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
}
