import {
  Controller,
  Get,
  Post,
  Query,
  Body,
  Res,
  HttpCode,
  HttpStatus,
  ParseIntPipe,
  DefaultValuePipe,
} from '@nestjs/common';
import { FastifyReply } from 'fastify';
import { AuditService } from '../services/audit.service';
import { SiemExportService, SiemExportConfig, AuditQueryFilters } from '../services/siem-export.service';
import { AuditSeverity } from '../entities/audit-event.entity';

@Controller('audit')
export class AuditController {
  constructor(
    private readonly auditService: AuditService,
    private readonly siemExport: SiemExportService,
  ) {}

  /**
   * GET /audit/events
   * Cross-domain audit trail query.
   * Supports filtering by actor, event type, resource, domain prefix, severity, and date range.
   */
  @Get('events')
  async queryEvents(
    @Query('actorId') actorId?: string,
    @Query('eventType') eventType?: string,
    @Query('resourceType') resourceType?: string,
    @Query('resourceId') resourceId?: string,
    @Query('severity') severity?: AuditSeverity,
    @Query('domains') domainsRaw?: string,
    @Query('from') fromRaw?: string,
    @Query('to') toRaw?: string,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit = 50,
    @Query('offset', new DefaultValuePipe(0), ParseIntPipe) offset = 0,
  ) {
    const domains = domainsRaw ? domainsRaw.split(',').map((d) => d.trim()) : undefined;
    const from = fromRaw ? new Date(fromRaw) : undefined;
    const to = toRaw ? new Date(toRaw) : undefined;

    const filters: AuditQueryFilters = {
      actorId,
      eventType,
      resourceType,
      resourceId,
      severity,
      domains,
      from,
      to,
      limit,
      offset,
    };

    const [events, total] = await this.siemExport.queryAuditTrail(filters);

    return {
      total,
      limit,
      offset,
      data: events,
    };
  }

  /**
   * GET /audit/export/cef
   * Download audit events in CEF (Common Event Format) — one event per line.
   * Suitable for SIEM ingestion (ArcSight, Splunk, QRadar, etc.).
   */
  @Get('export/cef')
  async exportCef(
    @Res() res: FastifyReply,
    @Query('actorId') actorId?: string,
    @Query('eventType') eventType?: string,
    @Query('resourceType') resourceType?: string,
    @Query('severity') severity?: AuditSeverity,
    @Query('domains') domainsRaw?: string,
    @Query('from') fromRaw?: string,
    @Query('to') toRaw?: string,
    @Query('limit', new DefaultValuePipe(1000), ParseIntPipe) limit = 1000,
  ) {
    const filters: AuditQueryFilters = {
      actorId,
      eventType,
      resourceType,
      severity,
      domains: domainsRaw ? domainsRaw.split(',').map((d) => d.trim()) : undefined,
      from: fromRaw ? new Date(fromRaw) : undefined,
      to: toRaw ? new Date(toRaw) : undefined,
      limit,
    };

    const lines = await this.siemExport.exportCef(filters);
    const body = lines.join('\n');

    return res
      .header('Content-Type', 'text/plain; charset=utf-8')
      .header('Content-Disposition', `attachment; filename="coescd-audit-${Date.now()}.cef"`)
      .send(body);
  }

  /**
   * POST /audit/export/siem
   * Push a batch of audit events to a remote SIEM via UDP syslog.
   */
  @Post('export/siem')
  @HttpCode(HttpStatus.OK)
  async pushToSiem(
    @Body() body: { filters: AuditQueryFilters; siem: SiemExportConfig },
  ) {
    const result = await this.siemExport.sendToSiem(body.filters, body.siem);
    return result;
  }
}
