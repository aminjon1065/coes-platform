import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan } from 'typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';
import * as dgram from 'dgram';
import { AuditEvent, AuditSeverity } from '../entities/audit-event.entity';
import { AuditArchive } from '../entities/audit-archive.entity';

/** Maps our severity to CEF/Syslog severity (RFC 5424) */
const SYSLOG_SEVERITY: Record<AuditSeverity, number> = {
  [AuditSeverity.INFO]: 6,      // Informational
  [AuditSeverity.WARNING]: 4,   // Warning
  [AuditSeverity.CRITICAL]: 2,  // Critical
};

const SYSLOG_FACILITY = 13; // log audit (security/authorization)

export interface SiemExportConfig {
  host: string;
  port: number;
  protocol: 'udp4' | 'tcp'; // UDP for now; TCP TLS in future
}

export interface AuditQueryFilters {
  actorId?: string;
  eventType?: string;
  resourceType?: string;
  resourceId?: string;
  severity?: AuditSeverity;
  from?: Date;
  to?: Date;
  domains?: string[];   // filter by event_type prefix, e.g. ['iam', 'tasks']
  limit?: number;
  offset?: number;
}

@Injectable()
export class SiemExportService {
  private readonly logger = new Logger(SiemExportService.name);

  constructor(
    @InjectRepository(AuditEvent)
    private readonly auditRepo: Repository<AuditEvent>,
    @InjectRepository(AuditArchive)
    private readonly archiveRepo: Repository<AuditArchive>,
  ) {}

  // ── CEF formatting ──────────────────────────────────────────────────────────

  /**
   * Format a single AuditEvent as a CEF (Common Event Format) string.
   * CEF:Version|Device Vendor|Device Product|Device Version|Signature ID|Name|Severity|Extension
   */
  formatCef(event: AuditEvent): string {
    const severity = this.cefSeverity(event.severity);
    const signatureId = event.eventType.replace(/\./g, '_').toUpperCase();
    const name = event.eventType;

    // Escape CEF header fields
    const escape = (s: string) => s.replace(/\\/g, '\\\\').replace(/\|/g, '\\|');

    const header = [
      'CEF:0',
      escape('CoESCD'),
      escape('UnifiedPlatform'),
      escape('1.0'),
      escape(signatureId),
      escape(name),
      String(severity),
    ].join('|');

    // Build extension key=value pairs
    const ext: string[] = [
      `rt=${event.occurredAt.getTime()}`,
      `outcome=${event.success ? 'success' : 'failure'}`,
    ];

    if (event.actorId) ext.push(`suid=${this.cefEscapeExt(event.actorId)}`);
    if (event.actorUsername) ext.push(`suser=${this.cefEscapeExt(event.actorUsername)}`);
    if (event.ipAddress) ext.push(`src=${this.cefEscapeExt(event.ipAddress)}`);
    if (event.resourceType) ext.push(`cs1Label=resourceType`, `cs1=${this.cefEscapeExt(event.resourceType)}`);
    if (event.resourceId) ext.push(`cs2Label=resourceId`, `cs2=${this.cefEscapeExt(event.resourceId)}`);
    if (event.failureReason) ext.push(`msg=${this.cefEscapeExt(event.failureReason)}`);
    if (event.integrityHash) ext.push(`cs3Label=integrityHash`, `cs3=${event.integrityHash}`);

    return `${header}|${ext.join(' ')}`;
  }

  /**
   * Format a single AuditEvent as an RFC 5424 syslog message.
   */
  formatSyslog(event: AuditEvent, hostname = 'coescd-platform'): string {
    const pri = SYSLOG_FACILITY * 8 + SYSLOG_SEVERITY[event.severity];
    const ts = event.occurredAt.toISOString();
    const appName = 'coescd-backend';
    const msgId = event.eventType.toUpperCase().replace(/\./g, '_');
    const msg = this.formatCef(event);

    // RFC 5424: <PRI>VERSION TIMESTAMP HOSTNAME APP-NAME PROCID MSGID STRUCTURED-DATA MSG
    return `<${pri}>1 ${ts} ${hostname} ${appName} - ${msgId} - ${msg}`;
  }

  /**
   * Export a batch of events as CEF-formatted lines.
   */
  async exportCef(filters: AuditQueryFilters): Promise<string[]> {
    const events = await this.queryWithFilters(filters);
    return events.map((e) => this.formatCef(e));
  }

  /**
   * Stream a batch of audit events to a remote SIEM via UDP syslog.
   */
  async sendToSiem(
    filters: AuditQueryFilters,
    siemConfig: SiemExportConfig,
  ): Promise<{ sent: number; errors: number }> {
    const events = await this.queryWithFilters(filters);
    let sent = 0;
    let errors = 0;

    const socket = dgram.createSocket(siemConfig.protocol);

    for (const event of events) {
      const message = Buffer.from(this.formatSyslog(event));
      await new Promise<void>((resolve) => {
        socket.send(message, siemConfig.port, siemConfig.host, (err) => {
          if (err) {
            this.logger.warn(`SIEM send error for event ${event.id}: ${err.message}`);
            errors++;
          } else {
            sent++;
          }
          resolve();
        });
      });
    }

    socket.close();
    this.logger.log(`SIEM export complete: ${sent} sent, ${errors} errors`);
    return { sent, errors };
  }

  // ── Cross-domain query ───────────────────────────────────────────────────────

  async queryAuditTrail(filters: AuditQueryFilters): Promise<[AuditEvent[], number]> {
    return this.queryWithFiltersAndCount(filters);
  }

  // ── Retention management ────────────────────────────────────────────────────

  /**
   * Archive events older than `retentionDays` into audit_archive table.
   * Archived events are removed from the hot audit_events table.
   * Runs daily at 02:30.
   */
  @Cron('30 2 * * *')
  async archiveOldEvents(): Promise<void> {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 90); // 90-day hot retention

    const oldEvents = await this.auditRepo.find({
      where: { occurredAt: LessThan(cutoff) },
      take: 10_000, // batch size
      order: { occurredAt: 'ASC' },
    });

    if (oldEvents.length === 0) return;

    const archives = oldEvents.map((e) =>
      this.archiveRepo.create({
        originalId: e.id,
        actorId: e.actorId,
        actorUsername: e.actorUsername,
        eventType: e.eventType,
        resourceType: e.resourceType,
        resourceId: e.resourceId,
        ipAddress: e.ipAddress,
        success: e.success,
        failureReason: e.failureReason,
        severity: e.severity,
        metadata: e.metadata,
        integrityHash: e.integrityHash,
        occurredAt: e.occurredAt,
      }),
    );

    await this.archiveRepo.save(archives);
    const ids = oldEvents.map((e) => e.id);
    await this.auditRepo
      .createQueryBuilder()
      .delete()
      .whereInIds(ids)
      .execute();

    this.logger.log(`Archived ${oldEvents.length} audit events older than ${cutoff.toISOString()}`);
  }

  /**
   * Permanently purge archived events older than `archiveRetentionDays` (default: 7 years).
   * Runs on the 1st of each month at 03:00.
   */
  @Cron('0 3 1 * *')
  async purgeExpiredArchives(): Promise<void> {
    const cutoff = new Date();
    cutoff.setFullYear(cutoff.getFullYear() - 7);

    const result = await this.archiveRepo
      .createQueryBuilder()
      .delete()
      .where('occurred_at < :cutoff', { cutoff })
      .execute();

    this.logger.log(`Purged ${result.affected ?? 0} archived audit events older than 7 years`);
  }

  // ── Internal helpers ────────────────────────────────────────────────────────

  private async queryWithFilters(filters: AuditQueryFilters): Promise<AuditEvent[]> {
    const [events] = await this.queryWithFiltersAndCount(filters);
    return events;
  }

  private async queryWithFiltersAndCount(
    filters: AuditQueryFilters,
  ): Promise<[AuditEvent[], number]> {
    const qb = this.auditRepo.createQueryBuilder('e');

    if (filters.actorId) qb.andWhere('e.actor_id = :actorId', { actorId: filters.actorId });
    if (filters.eventType) qb.andWhere('e.event_type = :eventType', { eventType: filters.eventType });
    if (filters.resourceType) qb.andWhere('e.resource_type = :resourceType', { resourceType: filters.resourceType });
    if (filters.resourceId) qb.andWhere('e.resource_id = :resourceId', { resourceId: filters.resourceId });
    if (filters.severity) qb.andWhere('e.severity = :severity', { severity: filters.severity });
    if (filters.from) qb.andWhere('e.occurred_at >= :from', { from: filters.from });
    if (filters.to) qb.andWhere('e.occurred_at <= :to', { to: filters.to });

    if (filters.domains && filters.domains.length > 0) {
      const domainConditions = filters.domains
        .map((d, i) => `e.event_type LIKE :domain${i}`)
        .join(' OR ');
      const domainParams = Object.fromEntries(
        filters.domains.map((d, i) => [`domain${i}`, `${d}.%`]),
      );
      qb.andWhere(`(${domainConditions})`, domainParams);
    }

    qb.orderBy('e.occurred_at', 'DESC')
      .limit(Math.min(filters.limit ?? 100, 1000))
      .offset(filters.offset ?? 0);

    return qb.getManyAndCount();
  }

  private cefSeverity(severity: AuditSeverity): number {
    const map: Record<AuditSeverity, number> = {
      [AuditSeverity.INFO]: 3,
      [AuditSeverity.WARNING]: 6,
      [AuditSeverity.CRITICAL]: 9,
    };
    return map[severity];
  }

  /** Escape special chars in CEF extension values */
  private cefEscapeExt(value: string): string {
    return value.replace(/\\/g, '\\\\').replace(/=/g, '\\=').replace(/\n/g, '\\n').replace(/\r/g, '\\r');
  }
}
