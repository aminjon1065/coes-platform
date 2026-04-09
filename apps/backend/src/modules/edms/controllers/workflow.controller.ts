import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  ParseUUIDPipe,
  HttpCode,
  HttpStatus,
  Req,
} from '@nestjs/common';
import { FastifyRequest } from 'fastify';

import { WorkflowService } from '../services/workflow.service';
import { CreateWorkflowTemplateDto } from '../dto/create-workflow-template.dto';
import { ActOnStepDto } from '../dto/act-on-step.dto';

interface AuthenticatedRequest extends FastifyRequest {
  user: {
    sub: string;
    clearance: number;
    positionId?: string;
  };
}

@Controller('edms')
export class WorkflowController {
  constructor(private readonly workflowService: WorkflowService) {}

  // ─── Templates ───────────────────────────────────────────────────────────────

  @Get('workflow-templates')
  listTemplates(@Query('documentTypeId') documentTypeId?: string) {
    return this.workflowService.listTemplates(documentTypeId);
  }

  @Get('workflow-templates/:id')
  getTemplate(@Param('id', ParseUUIDPipe) id: string) {
    return this.workflowService.getTemplate(id);
  }

  @Post('workflow-templates')
  @HttpCode(HttpStatus.CREATED)
  createTemplate(@Body() dto: CreateWorkflowTemplateDto, @Req() req: AuthenticatedRequest) {
    return this.workflowService.createTemplate(dto, req.user.sub);
  }

  // ─── Workflow Instance (per document) ─────────────────────────────────────────

  @Get('documents/:id/workflow')
  getInstance(@Param('id', ParseUUIDPipe) id: string, @Req() req: AuthenticatedRequest) {
    return this.workflowService.getInstance(id, req.user.clearance ?? 0);
  }

  @Get('documents/:id/workflow/history')
  getHistory(@Param('id', ParseUUIDPipe) id: string, @Req() req: AuthenticatedRequest) {
    return this.workflowService.getInstanceHistory(id, req.user.clearance ?? 0);
  }

  /** Manually start a workflow (admin / post-registration hook) */
  @Post('documents/:id/workflow/start')
  @HttpCode(HttpStatus.CREATED)
  startWorkflow(@Param('id', ParseUUIDPipe) id: string, @Req() req: AuthenticatedRequest) {
    return this.workflowService.startWorkflow(id, req.user.sub, req.user.positionId ?? null);
  }

  /** Resume a suspended (returned-for-revision) workflow after resubmission */
  @Post('documents/:id/workflow/resume')
  @HttpCode(HttpStatus.OK)
  resumeWorkflow(@Param('id', ParseUUIDPipe) id: string, @Req() req: AuthenticatedRequest) {
    return this.workflowService.resumeWorkflow(
      id,
      req.user.sub,
      req.user.positionId!,
      req.user.clearance ?? 0,
    );
  }

  // ─── Step Actions ─────────────────────────────────────────────────────────────

  @Post('documents/:documentId/workflow/steps/:stepId/act')
  @HttpCode(HttpStatus.OK)
  actOnStep(
    @Param('documentId', ParseUUIDPipe) documentId: string,
    @Param('stepId', ParseUUIDPipe) stepId: string,
    @Body() dto: ActOnStepDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.workflowService.actOnStep(
      documentId,
      stepId,
      dto,
      req.user.sub,
      req.user.positionId!,
      req.user.clearance ?? 0,
    );
  }
}
