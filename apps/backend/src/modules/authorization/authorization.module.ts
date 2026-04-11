import { Module, Global } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Role } from './entities/role.entity';
import { Permission } from './entities/permission.entity';
import { UserRoleAssignment } from './entities/user-role-assignment.entity';
import { Delegation } from './entities/delegation.entity';
import { PositionRole } from './entities/position-role.entity';
import { SodRule } from './entities/sod-rule.entity';
import { AuthorizationService } from './services/authorization.service';
import { DelegatedAdminService } from './services/delegated-admin.service';
import { GovernanceService } from './services/governance.service';
import { PermissionGuard } from './guards/permission.guard';
import { DelegatedAdminController } from './controllers/delegated-admin.controller';
import { RolesController } from './controllers/roles.controller';
import { PortalContextController } from './controllers/portal-context.controller';
import { UserRoleAssignmentsController } from './controllers/user-role-assignments.controller';
import { AdminSummaryController } from './controllers/admin-summary.controller';
import { AdminOperationsController } from './controllers/admin-operations.controller';
import { GovernanceController } from './controllers/governance.controller';
import { OrgModule } from '../org/org.module';
import { UsersModule } from '../users/users.module';
import { SearchModule } from '../search/search.module';
import { CallsModule } from '../calls/calls.module';
import { AuditModule } from '../audit/audit.module';
import { ReportingModule } from '../reporting/reporting.module';
import { AnalyticsModule } from '../analytics/analytics.module';
import { AdminOperationsService } from './services/admin-operations.service';

@Global()
@Module({
  imports: [
    TypeOrmModule.forFeature([Role, Permission, UserRoleAssignment, Delegation, PositionRole, SodRule]),
    OrgModule,
    UsersModule,
    SearchModule,
    CallsModule,
    AuditModule,
    ReportingModule,
    AnalyticsModule,
  ],
  controllers: [
    DelegatedAdminController,
    RolesController,
    PortalContextController,
    UserRoleAssignmentsController,
    AdminSummaryController,
    AdminOperationsController,
    GovernanceController,
  ],
  providers: [AuthorizationService, DelegatedAdminService, GovernanceService, PermissionGuard, AdminOperationsService],
  exports: [AuthorizationService, DelegatedAdminService, GovernanceService, PermissionGuard],
})
export class AuthorizationModule {}
