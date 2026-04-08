import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { AuthorizationService } from '../services/authorization.service';
import { UsersService } from '../../users/services/users.service';
import { OrgService } from '../../org/services/org.service';
import { SearchMaintenanceService } from '../../search/services/search-maintenance.service';
import { AuditService } from '../../audit/services/audit.service';
import { RequirePermission } from '../decorators/require-permission.decorator';

@ApiTags('Authorization / Admin')
@ApiBearerAuth()
@Controller({ path: 'authorization/admin', version: '1' })
export class AdminSummaryController {
  constructor(
    private readonly authorizationService: AuthorizationService,
    private readonly usersService: UsersService,
    private readonly orgService: OrgService,
    private readonly searchMaintenanceService: SearchMaintenanceService,
    private readonly auditService: AuditService,
  ) {}

  @Get('summary')
  @RequirePermission('iam.user.read')
  @ApiOperation({ summary: 'Get admin dashboard summary for portal control plane' })
  @ApiQuery({ name: 'auditLimit', required: false, type: Number })
  async getSummary(@Query('auditLimit') auditLimit?: number) {
    const [[, usersTotal], departmentTree, positions, roles, searchHealth, [auditItems]] =
      await Promise.all([
        this.usersService.listProfiles({ limit: 1, offset: 0 }),
        this.orgService.getDepartmentTree(),
        this.orgService.getAllActivePositions(),
        this.authorizationService.listRoles(),
        this.searchMaintenanceService.getHealth(),
        this.auditService.queryEvents({ limit: auditLimit ?? 5, offset: 0 }),
      ]);

    const countDepartments = (nodes: Array<{ children?: Array<unknown> }>): number =>
      nodes.reduce((count, node) => {
        const children = Array.isArray(node.children)
          ? (node.children as Array<{ children?: Array<unknown> }>)
          : [];
        return count + 1 + countDepartments(children);
      }, 0);

    return {
      kpis: {
        users: usersTotal,
        departments: countDepartments(departmentTree),
        positions: positions.length,
        roles: roles.length,
      },
      search: searchHealth,
      recentAudit: auditItems.map((event) => ({
        id: event.id,
        actorId: event.actorId,
        actorUsername: event.actorUsername,
        eventType: event.eventType,
        resourceType: event.resourceType,
        resourceId: event.resourceId,
        success: event.success,
        failureReason: event.failureReason,
        severity: event.severity,
        occurredAt: event.occurredAt,
        metadata: event.metadata,
      })),
    };
  }
}
