import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  ParseUUIDPipe,
  Query,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';

import { AnalyticsService } from '../services/analytics.service';
import { SubmissionStatus } from '../entities/form-submission.entity';
import { CurrentUser } from '../../iam/decorators/current-user.decorator';

import {
  RegisterIncidentDto,
  UpdateIncidentDto,
  RecordResponseDto,
  DeployResourceDto,
  CreateFormDto,
  SubmitFormDto,
  ListIncidentsDto,
  StatsQueryDto,
  GenerateReportDto,
} from '../dto';

interface JwtPayload {
  sub: string;
  positionId?: string;
  clearanceLevel?: number;
}

function toCtx(user: JwtPayload) {
  return {
    userId: user.sub,
    positionId: user.positionId,
    clearanceLevel: user.clearanceLevel ?? 0,
  };
}

@ApiTags('Analytics')
@ApiBearerAuth()
@Controller('analytics')
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  // ── Incident Registry ─────────────────────────────────────────────────────

  @ApiOperation({ summary: 'Register a new incident in the analytics registry' })
  @Post('incidents')
  registerIncident(
    @Body() dto: RegisterIncidentDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.analyticsService.registerIncident(dto, toCtx(user));
  }

  @ApiOperation({ summary: 'List incidents (filtered, clearance-aware)' })
  @Get('incidents')
  listIncidents(
    @Query() dto: ListIncidentsDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.analyticsService.listIncidents(dto, toCtx(user));
  }

  @ApiOperation({ summary: 'Get a single incident by ID' })
  @Get('incidents/:id')
  getIncident(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.analyticsService.getIncident(id, toCtx(user));
  }

  @ApiOperation({ summary: 'Get incident by incident reference number' })
  @Get('incidents/by-ref/:ref')
  getIncidentByRef(
    @Param('ref') ref: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.analyticsService.getIncidentByRef(ref, toCtx(user));
  }

  @ApiOperation({ summary: 'Update incident attributes, severity, or status' })
  @Patch('incidents/:id')
  updateIncident(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateIncidentDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.analyticsService.updateIncident(id, dto, toCtx(user));
  }

  // ── Response Timeline ─────────────────────────────────────────────────────

  @ApiOperation({ summary: 'Record a response action on an incident' })
  @Post('incidents/:id/responses')
  recordResponse(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RecordResponseDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.analyticsService.recordResponse(id, dto, toCtx(user));
  }

  @ApiOperation({ summary: 'Get the full response timeline for an incident' })
  @Get('incidents/:id/responses')
  getTimeline(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.analyticsService.getResponseTimeline(id, toCtx(user));
  }

  // ── Resource Deployments ──────────────────────────────────────────────────

  @ApiOperation({ summary: 'Record a resource deployment to an incident' })
  @Post('incidents/:id/resources')
  deployResource(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: DeployResourceDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.analyticsService.deployResource(id, dto, toCtx(user));
  }

  @ApiOperation({ summary: 'Get all resource deployments for an incident' })
  @Get('incidents/:id/resources')
  getResources(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.analyticsService.getResourceDeployments(id, toCtx(user));
  }

  @ApiOperation({ summary: 'Mark a deployed resource as withdrawn' })
  @Patch('resources/:id/withdraw')
  withdrawResource(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.analyticsService.withdrawResource(id, toCtx(user));
  }

  // ── Statistical Analytics ─────────────────────────────────────────────────

  @ApiOperation({ summary: 'Get aggregated incident statistics with optional filters' })
  @Get('stats/incidents')
  getIncidentStats(
    @Query() dto: StatsQueryDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.analyticsService.getIncidentStats(dto, toCtx(user));
  }

  @ApiOperation({ summary: 'Get time-series incident trend analysis' })
  @Get('stats/trends')
  getTrendAnalysis(
    @Query() dto: StatsQueryDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.analyticsService.getTrendAnalysis(dto, toCtx(user));
  }

  @ApiOperation({ summary: 'Get seasonal pattern analysis (month-of-year aggregation)' })
  @Get('stats/seasonal')
  getSeasonalPattern(
    @Query() dto: StatsQueryDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.analyticsService.getSeasonalPattern(dto, toCtx(user));
  }

  @ApiOperation({ summary: 'Get response time percentile metrics' })
  @Get('stats/response-times')
  getResponseTimeMetrics(
    @Query() dto: StatsQueryDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.analyticsService.getResponseTimeMetrics(dto, toCtx(user));
  }

  @ApiOperation({ summary: 'Get resource utilisation summary' })
  @Get('stats/resource-utilisation')
  getResourceUtilisation(
    @Query() dto: StatsQueryDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.analyticsService.getResourceUtilisation(dto, toCtx(user));
  }

  // ── Data Collection Forms ─────────────────────────────────────────────────

  @ApiOperation({ summary: 'Create a data collection form template' })
  @Post('forms')
  createForm(
    @Body() dto: CreateFormDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.analyticsService.createForm(dto, toCtx(user));
  }

  @ApiOperation({ summary: 'Publish a form (make it available to field analysts)' })
  @Patch('forms/:id/publish')
  publishForm(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.analyticsService.publishForm(id, toCtx(user));
  }

  @ApiOperation({ summary: 'List published forms, optionally filtered by incident type' })
  @Get('forms')
  listForms(
    @Query('incidentType') incidentType: string | undefined,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.analyticsService.listForms(incidentType, toCtx(user));
  }

  @ApiOperation({ summary: 'Submit a completed form (field analyst data entry)' })
  @Post('forms/:id/submissions')
  submitForm(
    @Param('id', ParseUUIDPipe) formId: string,
    @Body() dto: SubmitFormDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.analyticsService.submitForm(formId, dto, toCtx(user));
  }

  @ApiOperation({ summary: 'Review a form submission (accept / reject)' })
  @Patch('submissions/:id/review')
  reviewSubmission(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: { status: SubmissionStatus; notes?: string },
    @CurrentUser() user: JwtPayload,
  ) {
    return this.analyticsService.reviewSubmission(id, body.status, body.notes ?? null, toCtx(user));
  }

  // ── Reports ────────────────────────────────────────────────────────────────

  @ApiOperation({ summary: 'Request a report to be generated' })
  @Post('reports')
  requestReport(
    @Body() dto: GenerateReportDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.analyticsService.requestReport(dto, toCtx(user));
  }

  @ApiOperation({ summary: 'Get the status and result of a generated report' })
  @Get('reports/:id')
  getReport(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.analyticsService.getReport(id, toCtx(user));
  }

  @ApiOperation({ summary: 'List your generated reports' })
  @Get('reports')
  listReports(@CurrentUser() user: JwtPayload) {
    return this.analyticsService.listReports(toCtx(user));
  }

  // ── Admin ──────────────────────────────────────────────────────────────────

  @ApiOperation({ summary: 'Trigger metrics snapshot computation (admin)' })
  @Post('admin/snapshot/:period')
  @HttpCode(HttpStatus.NO_CONTENT)
  async triggerSnapshot(
    @Param('period') period: 'daily' | 'weekly' | 'monthly',
  ) {
    await this.analyticsService.computeMetricsSnapshot(period);
  }
}
