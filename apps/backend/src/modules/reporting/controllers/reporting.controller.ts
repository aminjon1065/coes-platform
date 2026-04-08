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
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { FastifyRequest } from 'fastify';
import { ReportingService } from '../services/reporting.service';
import {
  ReportType,
  ReportFormat,
  DeliveryChannel,
} from '../entities/report-definition.entity';

interface ReportingRequest extends FastifyRequest {
  user: {
    sub: string;
    clearanceLevel?: number;
  };
}

@ApiTags('Reporting')
@ApiBearerAuth()
@Controller({ path: 'reporting', version: '1' })
export class ReportingController {
  constructor(private readonly reportingService: ReportingService) {}

  // ── Definitions ─────────────────────────────────────────────────────────────

  @ApiOperation({ summary: 'Create report definition' })
  @Post('definitions')
  @HttpCode(HttpStatus.CREATED)
  createDefinition(
    @Body()
    body: {
      name: string;
      description?: string;
      reportType: ReportType;
      querySpec?: object;
      defaultFormat?: ReportFormat;
      isScheduled?: boolean;
      cronExpression?: string;
      deliveryChannel?: DeliveryChannel;
      deliveryConfig?: object;
      classification?: number;
    },
    @Req() req: ReportingRequest,
  ) {
    return this.reportingService.createDefinition({ ...body, ownerId: req.user.sub });
  }

  @ApiOperation({ summary: 'List report definitions' })
  @Get('definitions')
  listDefinitions(@Req() req: ReportingRequest) {
    return this.reportingService.listDefinitions(req.user.clearanceLevel ?? 0);
  }

  @ApiOperation({ summary: 'Get report definition' })
  @Get('definitions/:id')
  getDefinition(@Param('id', ParseUUIDPipe) id: string, @Req() req: ReportingRequest) {
    return this.reportingService.getDefinition(id, req.user.clearanceLevel ?? 0);
  }

  // ── Execution ────────────────────────────────────────────────────────────────

  @ApiOperation({ summary: 'Trigger report execution' })
  @Post('definitions/:id/run')
  @HttpCode(HttpStatus.ACCEPTED)
  triggerReport(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: { parameters?: object },
    @Req() req: ReportingRequest,
  ) {
    return this.reportingService.triggerReport(id, body.parameters ?? {}, req.user.sub, 'manual');
  }

  @ApiOperation({ summary: 'Get report execution' })
  @Get('executions/:id')
  getExecution(@Param('id', ParseUUIDPipe) id: string) {
    return this.reportingService.getExecution(id);
  }

  @ApiOperation({ summary: 'List definition executions' })
  @Get('definitions/:id/executions')
  listExecutions(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('limit') limit?: string,
  ) {
    return this.reportingService.listExecutions(id, limit ? Number(limit) : 20);
  }
}
