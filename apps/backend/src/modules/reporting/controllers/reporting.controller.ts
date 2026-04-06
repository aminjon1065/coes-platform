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
} from '@nestjs/common';
import { ReportingService } from '../services/reporting.service';
import {
  ReportType,
  ReportFormat,
  DeliveryChannel,
} from '../entities/report-definition.entity';

const ACTOR_ID       = '00000000-0000-0000-0000-000000000001';
const USER_CLEARANCE = 3;

@Controller('api/v1/reporting')
export class ReportingController {
  constructor(private readonly reportingService: ReportingService) {}

  // ── Definitions ─────────────────────────────────────────────────────────────

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
  ) {
    return this.reportingService.createDefinition({ ...body, ownerId: ACTOR_ID });
  }

  @Get('definitions')
  listDefinitions() {
    return this.reportingService.listDefinitions(USER_CLEARANCE);
  }

  @Get('definitions/:id')
  getDefinition(@Param('id', ParseUUIDPipe) id: string) {
    return this.reportingService.getDefinition(id, USER_CLEARANCE);
  }

  // ── Execution ────────────────────────────────────────────────────────────────

  @Post('definitions/:id/run')
  @HttpCode(HttpStatus.ACCEPTED)
  triggerReport(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: { parameters?: object },
  ) {
    return this.reportingService.triggerReport(id, body.parameters ?? {}, ACTOR_ID, 'manual');
  }

  @Get('executions/:id')
  getExecution(@Param('id', ParseUUIDPipe) id: string) {
    return this.reportingService.getExecution(id);
  }

  @Get('definitions/:id/executions')
  listExecutions(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('limit') limit?: string,
  ) {
    return this.reportingService.listExecutions(id, limit ? Number(limit) : 20);
  }
}
