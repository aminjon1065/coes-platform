import {
  Controller,
  Get,
  Post,
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
}
