import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
  ParseUUIDPipe,
  HttpCode,
  HttpStatus,
  Req,
} from '@nestjs/common';
import { FastifyRequest } from 'fastify';
import { DelegatedAdminService } from '../services/delegated-admin.service';
import { GrantDeptRoleDto, RevokeDeptRoleDto } from '../dto/delegated-admin.dto';

/**
 * Department-scoped administration APIs.
 * All endpoints require the caller to hold the `dept:admin` permission
 * scoped to the target department — enforced inside DelegatedAdminService.
 */
@Controller('departments/:deptId/admin')
export class DelegatedAdminController {
  constructor(private readonly deptAdminService: DelegatedAdminService) {}

  // ── Role assignments ────────────────────────────────────────────────────────

  /** GET /departments/:deptId/admin/roles — list all role assignments in this dept */
  @Get('roles')
  async listAssignments(
    @Param('deptId', ParseUUIDPipe) deptId: string,
    @Req() req: FastifyRequest & { user: { sub: string } },
  ) {
    return this.deptAdminService.listDeptAssignments(req.user.sub, deptId);
  }

  /** POST /departments/:deptId/admin/roles — grant a role in this dept */
  @Post('roles')
  async grantRole(
    @Param('deptId', ParseUUIDPipe) deptId: string,
    @Body() dto: GrantDeptRoleDto,
    @Req() req: FastifyRequest & { user: { sub: string } },
  ) {
    return this.deptAdminService.grantDeptRole(req.user.sub, deptId, dto);
  }

  /** DELETE /departments/:deptId/admin/roles — revoke a role assignment */
  @Delete('roles')
  @HttpCode(HttpStatus.NO_CONTENT)
  async revokeRole(
    @Param('deptId', ParseUUIDPipe) deptId: string,
    @Body() dto: RevokeDeptRoleDto,
    @Req() req: FastifyRequest & { user: { sub: string } },
  ) {
    await this.deptAdminService.revokeDeptRole(req.user.sub, deptId, dto);
  }

  // ── Workflow templates ──────────────────────────────────────────────────────

  /** GET /departments/:deptId/admin/workflow-templates — list dept-owned templates */
  @Get('workflow-templates')
  async listTemplates(
    @Param('deptId', ParseUUIDPipe) deptId: string,
    @Req() req: FastifyRequest & { user: { sub: string } },
  ) {
    return this.deptAdminService.listDeptWorkflowTemplates(req.user.sub, deptId);
  }

  /** DELETE /departments/:deptId/admin/workflow-templates/:templateId — deactivate */
  @Delete('workflow-templates/:templateId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deactivateTemplate(
    @Param('deptId', ParseUUIDPipe) deptId: string,
    @Param('templateId', ParseUUIDPipe) templateId: string,
    @Req() req: FastifyRequest & { user: { sub: string } },
  ) {
    await this.deptAdminService.deactivateDeptTemplate(req.user.sub, deptId, templateId);
  }
}
