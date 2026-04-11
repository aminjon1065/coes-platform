import { Controller, Get, Query, ParseIntPipe, DefaultValuePipe, UseGuards } from '@nestjs/common';
import { GovernanceService } from '../services/governance.service';
import { PermissionGuard } from '../guards/permission.guard';
import { RequirePermission } from '../decorators/require-permission.decorator';

/**
 * Governance REST endpoints — accessible only to security_admin / audit_viewer roles.
 * All endpoints are read-only; remediation is performed via the admin-operations endpoints.
 */
@Controller('authz/governance')
@UseGuards(PermissionGuard)
export class GovernanceController {
  constructor(private readonly governanceService: GovernanceService) {}

  /**
   * GET /authz/governance/access-review
   * 90-day access review: stale assignments, active delegations, high-clearance users.
   * Required permission: authz.governance.read
   */
  @Get('access-review')
  @RequirePermission('authz.governance.read')
  getPendingAccessReview() {
    return this.governanceService.getPendingAccessReview();
  }

  /**
   * GET /authz/governance/orphan-assignments
   * Lists role assignments tied to positions the user no longer occupies.
   * Required permission: authz.governance.read
   */
  @Get('orphan-assignments')
  @RequirePermission('authz.governance.read')
  detectOrphanAssignments() {
    return this.governanceService.detectOrphanAssignments();
  }

  /**
   * GET /authz/governance/expiring-delegations?withinHours=48
   * Lists active delegations expiring within the given horizon (default 48 h).
   * Required permission: authz.governance.read
   */
  @Get('expiring-delegations')
  @RequirePermission('authz.governance.read')
  getExpiringDelegations(
    @Query('withinHours', new DefaultValuePipe(48), ParseIntPipe)
    withinHours: number,
  ) {
    return this.governanceService.getExpiringDelegations(withinHours);
  }

  /**
   * GET /authz/governance/sod-violations
   * Detective scan: users currently holding two SoD-conflicting roles.
   * Required permission: authz.governance.read
   */
  @Get('sod-violations')
  @RequirePermission('authz.governance.read')
  detectSodViolations() {
    return this.governanceService.detectSodViolations();
  }
}
