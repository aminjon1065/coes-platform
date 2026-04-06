import { Module, Global } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Role } from './entities/role.entity';
import { Permission } from './entities/permission.entity';
import { UserRoleAssignment } from './entities/user-role-assignment.entity';
import { Delegation } from './entities/delegation.entity';
import { AuthorizationService } from './services/authorization.service';
import { DelegatedAdminService } from './services/delegated-admin.service';
import { PermissionGuard } from './guards/permission.guard';
import { DelegatedAdminController } from './controllers/delegated-admin.controller';
import { OrgModule } from '../org/org.module';

@Global()
@Module({
  imports: [
    TypeOrmModule.forFeature([Role, Permission, UserRoleAssignment, Delegation]),
    OrgModule,
  ],
  controllers: [DelegatedAdminController],
  providers: [AuthorizationService, DelegatedAdminService, PermissionGuard],
  exports: [AuthorizationService, DelegatedAdminService, PermissionGuard],
})
export class AuthorizationModule {}
