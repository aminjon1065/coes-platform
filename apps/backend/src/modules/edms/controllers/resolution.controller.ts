import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  ParseUUIDPipe,
  HttpCode,
  HttpStatus,
  Req,
} from '@nestjs/common';
import { FastifyRequest } from 'fastify';

import { ResolutionService } from '../services/resolution.service';
import { IssueResolutionDto } from '../dto/issue-resolution.dto';

interface AuthenticatedRequest extends FastifyRequest {
  user: {
    sub: string;
    clearance: number;
    positionId?: string;
  };
}

@Controller('edms/documents')
export class ResolutionController {
  constructor(private readonly resolutionService: ResolutionService) {}

  @Get(':id/resolutions')
  getResolutions(@Param('id', ParseUUIDPipe) id: string, @Req() req: AuthenticatedRequest) {
    return this.resolutionService.getResolutions(
      id,
      req.user.sub,
      req.user.positionId ?? null,
      req.user.clearance ?? 0,
    );
  }

  @Post(':id/resolutions')
  @HttpCode(HttpStatus.CREATED)
  issueResolution(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: IssueResolutionDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.resolutionService.issueResolution(
      id,
      dto,
      req.user.sub,
      req.user.positionId!,
      req.user.clearance ?? 0,
    );
  }

  @Get(':id/executor-assignments')
  getExecutorAssignments(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.resolutionService.getExecutorAssignments(
      id,
      req.user.sub,
      req.user.positionId ?? null,
      req.user.clearance ?? 0,
    );
  }

  // ─── Executor Assignment Lifecycle (§9.3) ────────────────────────────────────

  /**
   * POST /edms/documents/executor-assignments/:id/accept
   * Formally accept the assignment — ASSIGNED → ACCEPTED. §9.3
   */
  @Post('executor-assignments/:assignmentId/accept')
  @HttpCode(HttpStatus.OK)
  acceptAssignment(
    @Param('assignmentId', ParseUUIDPipe) assignmentId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.resolutionService.acceptAssignment(
      assignmentId,
      req.user.sub,
      req.user.positionId!,
    );
  }

  /**
   * POST /edms/documents/executor-assignments/:id/start
   * Signal that active work has begun — ACCEPTED → IN_PROGRESS. §9.5
   */
  @Post('executor-assignments/:assignmentId/start')
  @HttpCode(HttpStatus.OK)
  markInProgress(
    @Param('assignmentId', ParseUUIDPipe) assignmentId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.resolutionService.markAssignmentInProgress(
      assignmentId,
      req.user.sub,
      req.user.positionId!,
    );
  }

  /**
   * POST /edms/documents/executor-assignments/:id/complete
   * File a completion report — transitions to COMPLETED. §9.7
   */
  @Post('executor-assignments/:assignmentId/complete')
  @HttpCode(HttpStatus.OK)
  fileCompletionReport(
    @Param('assignmentId', ParseUUIDPipe) assignmentId: string,
    @Body('report') report: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.resolutionService.fileCompletionReport(
      assignmentId,
      report,
      req.user.sub,
      req.user.positionId!,
    );
  }

  // ─── Sub-Assignments (§9.4) ───────────────────────────────────────────────────

  /**
   * POST /edms/documents/executor-assignments/:id/sub-assign
   * PRIMARY executor delegates a portion of work to a subordinate position. §9.4
   */
  @Post('executor-assignments/:assignmentId/sub-assign')
  @HttpCode(HttpStatus.CREATED)
  createSubAssignment(
    @Param('assignmentId', ParseUUIDPipe) assignmentId: string,
    @Body() dto: { positionId: string; instruction?: string; deadline?: string },
    @Req() req: AuthenticatedRequest,
  ) {
    return this.resolutionService.createSubAssignment(
      assignmentId,
      dto,
      req.user.sub,
      req.user.positionId!,
    );
  }

  // ─── Deadline Extension Requests (§9.6) ───────────────────────────────────────

  /**
   * GET /edms/documents/executor-assignments/:id/extensions
   * List all deadline extension requests for an assignment.
   */
  @Get('executor-assignments/:assignmentId/extensions')
  listDeadlineExtensions(
    @Param('assignmentId', ParseUUIDPipe) assignmentId: string,
  ) {
    return this.resolutionService.listDeadlineExtensions(assignmentId);
  }

  /**
   * POST /edms/documents/executor-assignments/:id/extensions
   * File a deadline extension request. §9.6
   */
  @Post('executor-assignments/:assignmentId/extensions')
  @HttpCode(HttpStatus.CREATED)
  requestDeadlineExtension(
    @Param('assignmentId', ParseUUIDPipe) assignmentId: string,
    @Body() dto: { requestedDeadline: string; justification: string },
    @Req() req: AuthenticatedRequest,
  ) {
    return this.resolutionService.requestDeadlineExtension(
      assignmentId,
      dto,
      req.user.sub,
      req.user.positionId!,
    );
  }

  /**
   * PATCH /edms/documents/deadline-extensions/:extensionId/approve
   * Approve a deadline extension. The assignment deadline is updated. §9.6
   */
  @Patch('deadline-extensions/:extensionId/approve')
  @HttpCode(HttpStatus.OK)
  approveDeadlineExtension(
    @Param('extensionId', ParseUUIDPipe) extensionId: string,
    @Body('remarks') remarks: string | undefined,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.resolutionService.approveDeadlineExtension(
      extensionId,
      remarks,
      req.user.sub,
      req.user.positionId!,
    );
  }

  /**
   * PATCH /edms/documents/deadline-extensions/:extensionId/deny
   * Deny a deadline extension. Assignment deadline unchanged. §9.6
   */
  @Patch('deadline-extensions/:extensionId/deny')
  @HttpCode(HttpStatus.OK)
  denyDeadlineExtension(
    @Param('extensionId', ParseUUIDPipe) extensionId: string,
    @Body('remarks') remarks: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.resolutionService.denyDeadlineExtension(
      extensionId,
      remarks,
      req.user.sub,
      req.user.positionId!,
    );
  }
}
