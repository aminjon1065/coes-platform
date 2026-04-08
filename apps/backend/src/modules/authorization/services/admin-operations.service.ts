import { Injectable } from '@nestjs/common';
import { SearchMaintenanceService } from '../../search/services/search-maintenance.service';
import { CallAdminService } from '../../calls/services/call-admin.service';
import { AnalyticsService } from '../../analytics/services/analytics.service';
import { ReportingService } from '../../reporting/services/reporting.service';
import { SiemExportService } from '../../audit/services/siem-export.service';
import { OutboxService } from '../../outbox/services/outbox.service';
import { InboxService } from '../../inbox/services/inbox.service';
import { AuditService } from '../../audit/services/audit.service';
import { AuditSeverity } from '../../audit/entities/audit-event.entity';

@Injectable()
export class AdminOperationsService {
  constructor(
    private readonly searchMaintenanceService: SearchMaintenanceService,
    private readonly callAdminService: CallAdminService,
    private readonly analyticsService: AnalyticsService,
    private readonly reportingService: ReportingService,
    private readonly siemExportService: SiemExportService,
    private readonly outboxService: OutboxService,
    private readonly inboxService: InboxService,
    private readonly auditService: AuditService,
  ) {}

  async getOperationsSnapshot() {
    const [searchHealth, calls, outbox, inbox, outboxBacklog, inboxBacklog] = await Promise.all([
      this.searchMaintenanceService.getHealth(),
      this.callAdminService.getOperationsSummary(),
      this.outboxService.getOperationsSummary(),
      this.inboxService.getOperationsSummary(),
      this.outboxService.listProblemBacklog(),
      this.inboxService.listProblemBacklog(),
    ]);

    return {
      backend: {
        status: 'ok',
        service: 'coescd-backend',
        uptimeSeconds: Math.floor(process.uptime()),
        timestamp: new Date().toISOString(),
      },
      gateway: {
        configured: Boolean(process.env.PORTAL_GATEWAY_WS_URL ?? process.env.GATEWAY_WS_URL),
        wsUrl:
          process.env.PORTAL_GATEWAY_WS_URL ??
          process.env.GATEWAY_WS_URL ??
          'ws://localhost:4001/ws',
        eventBusConfigured: Boolean(process.env.RABBITMQ_URL),
      },
      search: searchHealth,
      calls,
      reliability: {
        outbox,
        inbox,
        outboxBacklog,
        inboxBacklog,
      },
      jobs: {
        analytics: this.analyticsService.getSchedulerSummary(),
        reporting: this.reportingService.getSchedulerSummary(),
        audit: this.siemExportService.getSchedulerSummary(),
      },
    };
  }

  async replayOutboxEvent(eventId: string, actorId: string, actorUsername?: string) {
    const event = await this.outboxService.replayEvent(eventId);
    await this.auditService.emit({
      actorId,
      actorUsername,
      eventType: 'admin.reliability.outbox_replayed',
      resourceType: 'outbox_event',
      resourceId: eventId,
      severity: AuditSeverity.WARNING,
      metadata: {
        eventType: event.eventType,
        status: event.status,
      },
    });
    return event;
  }

  async markOutboxDeadLetter(eventId: string, actorId: string, actorUsername?: string) {
    const event = await this.outboxService.markDeadLetter(eventId);
    await this.auditService.emit({
      actorId,
      actorUsername,
      eventType: 'admin.reliability.outbox_dead_letter_forced',
      resourceType: 'outbox_event',
      resourceId: eventId,
      severity: AuditSeverity.WARNING,
      metadata: {
        eventType: event.eventType,
        status: event.status,
      },
    });
    return event;
  }

  async retryInboxMessage(messageId: string, actorId: string, actorUsername?: string) {
    const message = await this.inboxService.retryMessage(messageId);
    await this.auditService.emit({
      actorId,
      actorUsername,
      eventType: 'admin.reliability.inbox_retried',
      resourceType: 'inbox_message',
      resourceId: messageId,
      severity: AuditSeverity.WARNING,
      metadata: {
        consumer: message.consumer,
        eventType: message.eventType,
        status: message.status,
      },
    });
    return message;
  }

  async resetInboxMessage(messageId: string, actorId: string, actorUsername?: string) {
    const message = await this.inboxService.resetMessage(messageId);
    await this.auditService.emit({
      actorId,
      actorUsername,
      eventType: 'admin.reliability.inbox_reset',
      resourceType: 'inbox_message',
      resourceId: messageId,
      severity: AuditSeverity.WARNING,
      metadata: {
        consumer: message.consumer,
        eventType: message.eventType,
        status: message.status,
      },
    });
    return message;
  }
}
