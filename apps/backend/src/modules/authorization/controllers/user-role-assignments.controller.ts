import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, AuthenticatedUser } from '../../iam/decorators/current-user.decorator';
import { RequirePermission } from '../decorators/require-permission.decorator';
import { AssignUserRoleDto } from '../dto/assign-user-role.dto';
import { AuthorizationService } from '../services/authorization.service';

@ApiTags('Authorization / User Role Assignments')
@ApiBearerAuth()
@Controller({ path: 'authorization/users/:userId/roles', version: '1' })
export class UserRoleAssignmentsController {
  constructor(private readonly authorizationService: AuthorizationService) {}

  @Get()
  @RequirePermission('authz.role.assign')
  @ApiOperation({ summary: 'List active role assignments for a user' })
  listAssignments(@Param('userId', ParseUUIDPipe) userId: string) {
    return this.authorizationService.listUserRoleAssignments(userId);
  }

  @Post()
  @RequirePermission('authz.role.assign')
  @ApiOperation({ summary: 'Assign a role to a user' })
  assignRole(
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body() dto: AssignUserRoleDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.authorizationService.assignRoleToUser(actor.id, userId, dto);
  }

  @Delete(':assignmentId')
  @RequirePermission('authz.role.assign')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Revoke an active role assignment from a user' })
  async revokeRole(
    @Param('userId', ParseUUIDPipe) userId: string,
    @Param('assignmentId', ParseUUIDPipe) assignmentId: string,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    await this.authorizationService.revokeUserRoleAssignment(actor.id, userId, assignmentId);
  }
}
