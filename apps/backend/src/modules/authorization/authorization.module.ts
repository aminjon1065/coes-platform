import { Module, Global } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Role } from './entities/role.entity';
import { Permission } from './entities/permission.entity';
import { UserRoleAssignment } from './entities/user-role-assignment.entity';
import { Delegation } from './entities/delegation.entity';
import { AuthorizationService } from './services/authorization.service';
import { PermissionGuard } from './guards/permission.guard';
import { OrgModule } from '../org/org.module';

@Global()
@Module({
  imports: [
    TypeOrmModule.forFeature([Role, Permission, UserRoleAssignment, Delegation]),
    OrgModule,
  ],
  providers: [AuthorizationService, PermissionGuard],
  exports: [AuthorizationService, PermissionGuard],
})
export class AuthorizationModule {}
