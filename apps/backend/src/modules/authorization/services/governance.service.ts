import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository, InjectDataSource } from '@nestjs/typeorm';
import { Repository, IsNull, LessThan, DataSource } from 'typeorm';

import { UserRoleAssignment } from '../entities/user-role-assignment.entity';
import { Delegation, DelegationStatus } from '../entities/delegation.entity';
import { SodRule } from '../entities/sod-rule.entity';

export interface AccessReviewItem {
  userId: string;
  roleId: string;
  roleName: string;
  assignmentId: string;
  departmentScopeId: string | null;
  positionId: string | null;
  grantedById: string | null;
  assignedAt: Date;
  daysSinceAssignment: number;
  /** True when the user no longer occupies the position that originally justified the role */
  isOrphaned: boolean;
}

export interface ActiveDelegationSummary {
  delegationId: string;
  delegatorId: string;
  delegateId: string;
  authorityType: string;
  startAt: Date;
  endAt: Date;
  daysRemaining: number;
}

export interface PendingAccessReviewReport {
  generatedAt: Date;
  /** Functional role assignments older than 90 days */
  staleAssignments: AccessReviewItem[];
  /** Active delegations (all levels of clearance) */
  activeDelegations: ActiveDelegationSummary[];
  /** Users with Level-3+ clearance and their role count */
  highClearanceUsers: Array<{ userId: string; clearanceLevel: number; roleCount: number }>;
}

export interface OrphanAssignment {
  assignmentId: string;
  userId: string;
  roleId: string;
  roleName: string;
  positionId: string;
  /** Position the assignment was tied to — user no longer occupies it */
  vacatedAt: Date | null;
  assignedAt: Date;
}

export interface ExpiringDelegation {
  delegationId: string;
  delegatorId: string;
  delegateId: string;
  authorityType: string;
  endAt: Date;
  hoursRemaining: number;
}

@Injectable()
export class GovernanceService {
  private readonly logger = new Logger(GovernanceService.name);

  constructor(
    @InjectRepository(UserRoleAssignment)
    private readonly assignmentRepo: Repository<UserRoleAssignment>,
    @InjectRepository(Delegation)
    private readonly delegationRepo: Repository<Delegation>,
    @InjectRepository(SodRule)
    private readonly sodRuleRepo: Repository<SodRule>,
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  /**
   * 90-day access review report (§12 — Periodic governance scan).
   * Returns:
   *  - Non-standard roles assigned > 90 days ago without renewal
   *  - All currently active delegations
   *  - Users holding clearance Level 3 or above
   */
  async getPendingAccessReview(): Promise<PendingAccessReviewReport> {
    const now = new Date();
    const cutoff = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);

    // Stale role assignments (> 90 days, not revoked, not expired)
    const staleRaw = await this.assignmentRepo.find({
      where: { revokedAt: IsNull(), createdAt: LessThan(cutoff) },
      relations: ['role'],
      order: { createdAt: 'ASC' },
    });

    // Detect orphaned ones via cross-schema check
    const positionedAssignments = staleRaw.filter((a) => a.positionId !== null);
    let orphanedIds = new Set<string>();
    if (positionedAssignments.length > 0) {
      const rows: Array<{ assignment_id: string }> = await this.dataSource.query(
        `SELECT a.id AS assignment_id
           FROM authz.user_role_assignments a
      LEFT JOIN users.user_position_assignments upa
             ON upa.user_id = a.user_id
            AND upa.position_id = a.position_id
            AND upa.vacated_at IS NULL
          WHERE a.id = ANY($1::uuid[])
            AND upa.id IS NULL`,
        [positionedAssignments.map((a) => a.id)],
      );
      orphanedIds = new Set(rows.map((r) => r.assignment_id));
    }

    const staleAssignments: AccessReviewItem[] = staleRaw.map((a) => ({
      userId: a.userId,
      roleId: a.roleId,
      roleName: a.role.name,
      assignmentId: a.id,
      departmentScopeId: a.departmentScopeId,
      positionId: a.positionId,
      grantedById: a.grantedById,
      assignedAt: a.createdAt,
      daysSinceAssignment: Math.floor((now.getTime() - a.createdAt.getTime()) / 86_400_000),
      isOrphaned: orphanedIds.has(a.id),
    }));

    // Active delegations
    const delegations = await this.delegationRepo.find({
      where: { status: DelegationStatus.ACTIVE },
      order: { endAt: 'ASC' },
    });
    const activeDelegations: ActiveDelegationSummary[] = delegations
      .filter((d) => d.startAt <= now && d.endAt >= now && !d.revokedAt)
      .map((d) => ({
        delegationId: d.id,
        delegatorId: d.delegatorId,
        delegateId: d.delegateId,
        authorityType: d.authorityType,
        startAt: d.startAt,
        endAt: d.endAt,
        daysRemaining: Math.ceil((d.endAt.getTime() - now.getTime()) / 86_400_000),
      }));

    // High-clearance users (Level 3+) — sourced from users schema
    const highClearanceRows: Array<{ user_id: string; clearance_level: number; role_count: string }> =
      await this.dataSource.query(
        `SELECT u.id AS user_id, u.clearance_level,
                COUNT(DISTINCT ura.id) AS role_count
           FROM users.users u
      LEFT JOIN authz.user_role_assignments ura
             ON ura.user_id = u.id
            AND ura.revoked_at IS NULL
            AND (ura.expires_at IS NULL OR ura.expires_at > NOW())
          WHERE u.clearance_level >= 3
       GROUP BY u.id, u.clearance_level
       ORDER BY u.clearance_level DESC, role_count DESC`,
      );

    const highClearanceUsers = highClearanceRows.map((r) => ({
      userId: r.user_id,
      clearanceLevel: Number(r.clearance_level),
      roleCount: Number(r.role_count),
    }));

    return {
      generatedAt: now,
      staleAssignments,
      activeDelegations,
      highClearanceUsers,
    };
  }

  /**
   * Detect orphan assignments: users who have a role tied to a position
   * they no longer occupy (vacated or reassigned). §12 — detective control.
   */
  async detectOrphanAssignments(): Promise<OrphanAssignment[]> {
    const rows: Array<{
      assignment_id: string;
      user_id: string;
      role_id: string;
      role_name: string;
      position_id: string;
      vacated_at: Date | null;
      assigned_at: Date;
    }> = await this.dataSource.query(
      `SELECT
          ura.id         AS assignment_id,
          ura.user_id,
          ura.role_id,
          r.name         AS role_name,
          ura.position_id,
          upa.vacated_at,
          ura.created_at AS assigned_at
       FROM authz.user_role_assignments ura
       JOIN authz.roles r ON r.id = ura.role_id
  LEFT JOIN users.user_position_assignments upa
         ON upa.user_id = ura.user_id
        AND upa.position_id = ura.position_id
        AND upa.vacated_at IS NULL
      WHERE ura.position_id IS NOT NULL
        AND ura.revoked_at IS NULL
        AND upa.id IS NULL
      ORDER BY ura.created_at ASC`,
    );

    return rows.map((r) => ({
      assignmentId: r.assignment_id,
      userId: r.user_id,
      roleId: r.role_id,
      roleName: r.role_name,
      positionId: r.position_id,
      vacatedAt: r.vacated_at,
      assignedAt: r.assigned_at,
    }));
  }

  /**
   * Return delegations expiring within the next `withinHours` hours.
   * Default: 48 hours. Useful for scheduled notifications or dashboard warnings.
   */
  async getExpiringDelegations(withinHours = 48): Promise<ExpiringDelegation[]> {
    const now = new Date();
    const horizon = new Date(now.getTime() + withinHours * 3_600_000);

    const delegations = await this.delegationRepo.find({
      where: { status: DelegationStatus.ACTIVE },
      order: { endAt: 'ASC' },
    });

    return delegations
      .filter((d) => d.endAt >= now && d.endAt <= horizon && !d.revokedAt)
      .map((d) => ({
        delegationId: d.id,
        delegatorId: d.delegatorId,
        delegateId: d.delegateId,
        authorityType: d.authorityType,
        endAt: d.endAt,
        hoursRemaining: Math.ceil((d.endAt.getTime() - now.getTime()) / 3_600_000),
      }));
  }

  /**
   * Detective SoD scan: find all users who currently hold two roles
   * that violate an active SoD rule. Returns violations for operator review.
   */
  async detectSodViolations(): Promise<
    Array<{ userId: string; ruleId: string; roleAId: string; roleBId: string; description: string }>
  > {
    const activeRules = await this.sodRuleRepo.find({ where: { active: true } });
    if (!activeRules.length) return [];

    const violations: Array<{
      userId: string;
      ruleId: string;
      roleAId: string;
      roleBId: string;
      description: string;
    }> = [];

    for (const rule of activeRules) {
      const rows: Array<{ user_id: string }> = await this.dataSource.query(
        `SELECT DISTINCT a1.user_id
           FROM authz.user_role_assignments a1
           JOIN authz.user_role_assignments a2
             ON a2.user_id = a1.user_id
            AND a2.role_id = $2
            AND a2.revoked_at IS NULL
            AND (a2.expires_at IS NULL OR a2.expires_at > NOW())
          WHERE a1.role_id = $1
            AND a1.revoked_at IS NULL
            AND (a1.expires_at IS NULL OR a1.expires_at > NOW())`,
        [rule.roleAId, rule.roleBId],
      );

      for (const row of rows) {
        violations.push({
          userId: row.user_id,
          ruleId: rule.id,
          roleAId: rule.roleAId,
          roleBId: rule.roleBId,
          description: rule.description,
        });
      }
    }

    return violations;
  }
}
