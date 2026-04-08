import {
  BadRequestException,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Body,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthorizationService } from '../services/authorization.service';
import { CreateRoleDto } from '../dto/create-role.dto';
import { RequirePermission } from '../decorators/require-permission.decorator';
import { CurrentUser, AuthenticatedUser } from '../../iam/decorators/current-user.decorator';

@ApiTags('Authorization / Roles')
@ApiBearerAuth()
@Controller({ path: 'authorization/roles', version: '1' })
export class RolesController {
  constructor(private readonly authorizationService: AuthorizationService) {}

  @Get()
  @ApiOperation({ summary: 'List roles with their direct permissions' })
  async listRoles() {
    const roles = await this.authorizationService.listRoles();
    return roles.map((role) => ({
      id: role.id,
      name: role.name,
      description: role.description,
      parentRoleId: role.parentRoleId,
      isSystemRole: role.isSystemRole,
      permissions: role.permissions
        .map((permission) => permission.name)
        .sort((left, right) => left.localeCompare(right)),
      createdAt: role.createdAt,
      updatedAt: role.updatedAt,
    }));
  }

  @Get('capabilities')
  @ApiOperation({ summary: 'List all available capability names' })
  listCapabilities() {
    return this.authorizationService.listCapabilities();
  }

  @Post()
  @RequirePermission('authz.role.assign')
  @ApiOperation({ summary: 'Create a custom role' })
  async createRole(@Body() dto: CreateRoleDto, @CurrentUser() actor: AuthenticatedUser) {
    const role = await this.authorizationService.createRole(dto, actor.id);
    return {
      id: role.id,
      name: role.name,
      description: role.description,
      parentRoleId: role.parentRoleId,
      isSystemRole: role.isSystemRole,
      permissions: role.permissions
        .map((permission) => permission.name)
        .sort((left, right) => left.localeCompare(right)),
      createdAt: role.createdAt,
      updatedAt: role.updatedAt,
    };
  }

  @Delete(':id')
  @RequirePermission('authz.role.assign')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a custom role without active assignments' })
  async deleteRole(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() actor: AuthenticatedUser) {
    const deleted = await this.authorizationService.deleteRole(id, actor.id);
    if (!deleted) {
      throw new BadRequestException('Role could not be deleted');
    }
  }
}
