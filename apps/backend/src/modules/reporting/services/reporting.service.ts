import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Cron } from '@nestjs/schedule';
import { EventEmitter2 } from '@nestjs/event-emitter';

import {
  ReportDefinition,
  ReportType,
  ReportFormat,
  ReportStatus,
  DeliveryChannel,
} from '../entities/report-definition.entity';
import { ReportExecution } from '../entities/report-execution.entity';
import { AuditService } from '../../audit/services/audit.service';

// ── Query engines ─────────────────────────────────────────────────────────────

type ReportResult = {
  rows: object[];
  meta: object;
};

@Injectable()
export class ReportingService {
  private schedulerSummary = {
    cron: '*/5 * * * *',
    lastRunAt: null as string | null,
    triggeredCount: 0,
    error: null as string | null,
  };
  private readonly logger = new Logger(ReportingService.name);

  constructor(
    @InjectRepository(ReportDefinition)
    private readonly defRepo: Repository<ReportDefinition>,
    @InjectRepository(ReportExecution)
    private readonly execRepo: Repository<ReportExecution>,
    @InjectDataSource()
    private readonly dataSource: DataSource,
    private readonly auditService: AuditService,
    private readonly events: EventEmitter2,
  ) {}

  // ── Definitions ─────────────────────────────────────────────────────────────

  async createDefinition(dto: {
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
    ownerId: string;
  }): Promise<ReportDefinition> {
    const def = this.defRepo.create({
      name:             dto.name,
      description:      dto.description ?? null,
      reportType:       dto.reportType,
      querySpec:        dto.querySpec ?? {},
      defaultFormat:    dto.defaultFormat ?? ReportFormat.JSON,
      isScheduled:      dto.isScheduled ?? false,
      cronExpression:   dto.cronExpression ?? null,
      deliveryChannel:  dto.deliveryChannel ?? DeliveryChannel.DOWNLOAD,
      deliveryConfig:   dto.deliveryConfig ?? {},
      classification:   dto.classification ?? 1,
      ownerId:          dto.ownerId,
    });
    const saved = await this.defRepo.save(def);
    await this.auditService.emit({
      actorId: dto.ownerId,
      eventType: 'reporting.definition.created',
      resourceType: 'ReportDefinition',
      resourceId: saved.id,
      metadata: {
        reportType: saved.reportType,
        defaultFormat: saved.defaultFormat,
        isScheduled: saved.isScheduled,
      },
    });
    return saved;
  }

  async listDefinitions(userClearance: number): Promise<ReportDefinition[]> {
    return this.defRepo
      .createQueryBuilder('d')
      .where('d.classification <= :cl', { cl: userClearance })
      .andWhere('d.isActive = true')
      .orderBy('d.createdAt', 'DESC')
      .getMany();
  }

  async getDefinition(id: string, userClearance: number): Promise<ReportDefinition> {
    const def = await this.defRepo.findOne({ where: { id } });
    if (!def) throw new NotFoundException(`ReportDefinition ${id} not found`);
    if (def.classification > userClearance) throw new ForbiddenException('Insufficient clearance');
    return def;
  }

  // ── Execution ────────────────────────────────────────────────────────────────

  async triggerReport(
    definitionId: string,
    params: object = {},
    triggeredById: string | null,
    triggerSource: 'manual' | 'scheduled' | 'event' = 'manual',
  ): Promise<ReportExecution> {
    const def = await this.defRepo.findOne({ where: { id: definitionId } });
    if (!def) throw new NotFoundException(`ReportDefinition ${definitionId} not found`);

    const exec = this.execRepo.create({
      definitionId,
      status:          ReportStatus.PENDING,
      parameters:      params,
      format:          def.defaultFormat,
      triggerSource,
      triggeredById,
      deliveryChannel: def.deliveryChannel,
    });
    const saved = await this.execRepo.save(exec);
    await this.auditService.emit({
      actorId: triggeredById ?? undefined,
      eventType: 'reporting.execution.triggered',
      resourceType: 'ReportExecution',
      resourceId: saved.id,
      metadata: {
        definitionId,
        triggerSource,
        format: saved.format,
      },
    });

    // Run asynchronously — caller gets the pending execution immediately
    setImmediate(() => this.runExecution(saved.id, def));
    return saved;
  }

  async getExecution(id: string): Promise<ReportExecution> {
    const exec = await this.execRepo.findOne({ where: { id } });
    if (!exec) throw new NotFoundException(`ReportExecution ${id} not found`);
    return exec;
  }

  async listExecutions(definitionId: string, limit = 20): Promise<ReportExecution[]> {
    return this.execRepo.find({
      where: { definitionId },
      order: { createdAt: 'DESC' },
      take: limit,
    });
  }

  // ── Report Engines (5.4.1 + 5.4.2) ─────────────────────────────────────────

  private async runExecution(execId: string, def: ReportDefinition): Promise<void> {
    const startedAt = new Date();
    await this.execRepo.update(execId, {
      status:    ReportStatus.RUNNING,
      startedAt,
    });

    try {
      let result: ReportResult;

      switch (def.reportType) {
        case ReportType.INCIDENT_STATISTICAL:
          result = await this.buildIncidentStatisticalReport(def.querySpec as any);
          break;
        case ReportType.CROSS_DOMAIN:
          result = await this.buildCrossDomainReport(def.querySpec as any);
          break;
        case ReportType.RISK_FORECAST_SUMMARY:
          result = await this.buildRiskForecastSummaryReport(def.querySpec as any);
          break;
        case ReportType.RESOURCE_UTILISATION:
          result = await this.buildResourceUtilisationReport(def.querySpec as any);
          break;
        case ReportType.RESPONSE_TIME_ANALYSIS:
          result = await this.buildResponseTimeReport(def.querySpec as any);
          break;
        default:
          result = { rows: [], meta: { note: 'Custom report — no engine registered' } };
      }

      const completedAt = new Date();
      const durationMs  = completedAt.getTime() - startedAt.getTime();

      await this.execRepo.update(execId, {
        status:        ReportStatus.COMPLETE,
        inlineResult:  { data: result.rows, meta: result.meta },
        rowCount:      result.rows.length,
        completedAt,
        durationMs,
      });

      this.events.emit('reporting.execution.complete', { execId, definitionId: def.id });
      this.logger.log(
        `Report ${def.name} (${execId}) completed in ${durationMs}ms, ${result.rows.length} rows`,
      );
    } catch (err: any) {
      await this.execRepo.update(execId, {
        status:       ReportStatus.FAILED,
        errorMessage: err?.message ?? String(err),
        completedAt:  new Date(),
      });
      this.logger.error(`Report ${execId} failed: ${err?.message}`);
    }
  }

  // ── 5.4.1 Incident Statistical Analysis ─────────────────────────────────────

  private async buildIncidentStatisticalReport(spec: {
    dateFrom?: string;
    dateTo?: string;
    groupBy?: 'type' | 'severity' | 'admin' | 'month';
    incidentTypes?: string[];
  }): Promise<ReportResult> {
    const dateFrom    = spec.dateFrom ?? new Date(Date.now() - 90 * 86400_000).toISOString();
    const dateTo      = spec.dateTo ?? new Date().toISOString();
    const groupBy     = spec.groupBy ?? 'type';
    const typeFilter  = spec.incidentTypes?.length
      ? `AND incident_type = ANY(ARRAY['${spec.incidentTypes.join("','")}'])`
      : '';

    const groupExpr: Record<string, string> = {
      type:     'incident_type',
      severity: 'severity',
      admin:    "COALESCE(administrative_code, 'Unknown')",
      month:    "TO_CHAR(DATE_TRUNC('month', reported_at), 'YYYY-MM')",
    };

    const col = groupExpr[groupBy] ?? groupExpr.type;

    const rows = await this.dataSource.query(`
      SELECT
        ${col}                                                      AS dimension,
        COUNT(*)                                                    AS total_count,
        COUNT(*) FILTER (WHERE status IN ('resolved','closed'))     AS resolved_count,
        ROUND(100.0 * COUNT(*) FILTER (WHERE status IN ('resolved','closed'))
              / NULLIF(COUNT(*), 0), 1)                            AS resolution_rate_pct,
        AVG(EXTRACT(EPOCH FROM (first_response_at - reported_at))/60)
          FILTER (WHERE first_response_at IS NOT NULL)              AS avg_response_time_min,
        AVG(EXTRACT(EPOCH FROM (resolved_at - reported_at))/3600)
          FILTER (WHERE resolved_at IS NOT NULL)                    AS avg_resolution_time_hr,
        SUM(affected_population)                                    AS total_affected_population,
        SUM(casualties_confirmed)                                   AS total_casualties,
        PERCENTILE_CONT(0.5) WITHIN GROUP (
          ORDER BY EXTRACT(EPOCH FROM (first_response_at - reported_at))/60
        ) FILTER (WHERE first_response_at IS NOT NULL)              AS median_response_time_min
      FROM analytics.incidents
      WHERE reported_at BETWEEN $1 AND $2 ${typeFilter}
      GROUP BY ${col}
      ORDER BY total_count DESC
    `, [dateFrom, dateTo]);

    const meta = {
      reportType: 'incident_statistical',
      dateFrom,
      dateTo,
      groupBy,
      generatedAt: new Date().toISOString(),
    };

    return { rows, meta };
  }

  // ── 5.4.2 Cross-Domain Analytics ────────────────────────────────────────────

  private async buildCrossDomainReport(spec: {
    dateFrom?: string;
    dateTo?: string;
  }): Promise<ReportResult> {
    const dateFrom = spec.dateFrom ?? new Date(Date.now() - 90 * 86400_000).toISOString();
    const dateTo   = spec.dateTo ?? new Date().toISOString();

    // Join across analytics (incidents) + tasks + EDMS documents + GIS features
    // Uses administrative_code as the cross-domain correlation key
    const rows = await this.dataSource.query(`
      WITH incident_summary AS (
        SELECT
          COALESCE(administrative_code, 'Unknown') AS admin_code,
          COUNT(*)                                  AS incident_count,
          AVG(EXTRACT(EPOCH FROM (first_response_at - reported_at))/60)
            FILTER (WHERE first_response_at IS NOT NULL) AS avg_response_min,
          SUM(affected_population)                  AS total_affected_pop,
          SUM(casualties_confirmed)                 AS total_casualties
        FROM analytics.incidents
        WHERE reported_at BETWEEN $1 AND $2
        GROUP BY administrative_code
      ),
      task_summary AS (
        SELECT
          COALESCE(t.metadata->>'administrativeCode', 'Unknown') AS admin_code,
          COUNT(*)                            AS task_count,
          COUNT(*) FILTER (WHERE t.status = 'completed') AS completed_tasks,
          AVG(EXTRACT(EPOCH FROM (t.completed_at - t.created_at))/3600)
            FILTER (WHERE t.completed_at IS NOT NULL) AS avg_task_duration_hr
        FROM tasks.tasks t
        WHERE t.created_at BETWEEN $1 AND $2
        GROUP BY t.metadata->>'administrativeCode'
      ),
      doc_summary AS (
        SELECT
          COALESCE(d.metadata->>'administrativeCode', 'Unknown') AS admin_code,
          COUNT(*)      AS document_count,
          COUNT(*) FILTER (WHERE d.document_type = 'RESOLUTION') AS resolutions_count
        FROM edms.documents d
        WHERE d.created_at BETWEEN $1 AND $2
        GROUP BY d.metadata->>'administrativeCode'
      )
      SELECT
        COALESCE(i.admin_code, t.admin_code, d.admin_code) AS administrative_code,
        COALESCE(i.incident_count, 0)       AS incident_count,
        COALESCE(i.avg_response_min, 0)     AS avg_response_min,
        COALESCE(i.total_affected_pop, 0)   AS total_affected_population,
        COALESCE(i.total_casualties, 0)     AS total_casualties,
        COALESCE(t.task_count, 0)           AS task_count,
        COALESCE(t.completed_tasks, 0)      AS completed_tasks,
        COALESCE(t.avg_task_duration_hr, 0) AS avg_task_duration_hr,
        COALESCE(d.document_count, 0)       AS document_count,
        COALESCE(d.resolutions_count, 0)    AS resolutions_count
      FROM incident_summary i
      FULL OUTER JOIN task_summary  t ON i.admin_code = t.admin_code
      FULL OUTER JOIN doc_summary   d ON COALESCE(i.admin_code, t.admin_code) = d.admin_code
      ORDER BY incident_count DESC
    `, [dateFrom, dateTo]);

    return {
      rows,
      meta: {
        reportType: 'cross_domain',
        domains:    ['incidents', 'tasks', 'edms'],
        dateFrom,
        dateTo,
        generatedAt: new Date().toISOString(),
      },
    };
  }

  // ── Risk Forecast Summary ────────────────────────────────────────────────────

  private async buildRiskForecastSummaryReport(spec: {
    hazardTypes?: string[];
  }): Promise<ReportResult> {
    const hazardFilter = spec.hazardTypes?.length
      ? `AND hazard_type = ANY(ARRAY['${spec.hazardTypes.join("','")}'])`
      : '';

    const rows = await this.dataSource.query(`
      SELECT
        hazard_type,
        risk_tier,
        COUNT(*) AS prediction_count,
        ROUND(AVG(risk_score)::NUMERIC, 4) AS avg_risk_score,
        ROUND(MAX(risk_score)::NUMERIC, 4) AS max_risk_score,
        COUNT(*) FILTER (WHERE status = 'published') AS published_count,
        COUNT(*) FILTER (WHERE status = 'approved')  AS approved_count,
        COUNT(*) FILTER (WHERE status = 'pending')   AS pending_count,
        COUNT(*) FILTER (WHERE status = 'rejected')  AS rejected_count
      FROM ml.risk_predictions
      WHERE predicted_at >= NOW() - INTERVAL '7 days' ${hazardFilter}
      GROUP BY hazard_type, risk_tier
      ORDER BY hazard_type, risk_tier DESC
    `);

    return {
      rows,
      meta: {
        reportType:  'risk_forecast_summary',
        window:      '7 days',
        generatedAt: new Date().toISOString(),
      },
    };
  }

  // ── Resource Utilisation ────────────────────────────────────────────────────

  private async buildResourceUtilisationReport(spec: {
    dateFrom?: string;
    dateTo?: string;
  }): Promise<ReportResult> {
    const dateFrom = spec.dateFrom ?? new Date(Date.now() - 30 * 86400_000).toISOString();
    const dateTo   = spec.dateTo ?? new Date().toISOString();

    const rows = await this.dataSource.query(`
      SELECT
        resource_type,
        COUNT(DISTINCT incident_id)             AS incidents_served,
        COUNT(*)                                AS deployment_count,
        SUM(quantity_deployed)                  AS total_qty_deployed,
        AVG(EXTRACT(EPOCH FROM (released_at - deployed_at))/3600)
          FILTER (WHERE released_at IS NOT NULL) AS avg_deployment_hours,
        SUM(cost_estimate)                      AS total_cost_estimate
      FROM analytics.resource_deployments
      WHERE deployed_at BETWEEN $1 AND $2
      GROUP BY resource_type
      ORDER BY deployment_count DESC
    `, [dateFrom, dateTo]);

    return {
      rows,
      meta: {
        reportType:  'resource_utilisation',
        dateFrom,
        dateTo,
        generatedAt: new Date().toISOString(),
      },
    };
  }

  // ── Response Time Analysis ───────────────────────────────────────────────────

  private async buildResponseTimeReport(spec: {
    dateFrom?: string;
    dateTo?: string;
  }): Promise<ReportResult> {
    const dateFrom = spec.dateFrom ?? new Date(Date.now() - 90 * 86400_000).toISOString();
    const dateTo   = spec.dateTo ?? new Date().toISOString();

    const rows = await this.dataSource.query(`
      SELECT
        incident_type,
        severity,
        COUNT(*) FILTER (WHERE first_response_at IS NOT NULL) AS responded_count,
        ROUND(
          PERCENTILE_CONT(0.25) WITHIN GROUP (
            ORDER BY EXTRACT(EPOCH FROM (first_response_at - reported_at))/60
          ) FILTER (WHERE first_response_at IS NOT NULL)::NUMERIC, 1
        ) AS p25_response_min,
        ROUND(
          PERCENTILE_CONT(0.5) WITHIN GROUP (
            ORDER BY EXTRACT(EPOCH FROM (first_response_at - reported_at))/60
          ) FILTER (WHERE first_response_at IS NOT NULL)::NUMERIC, 1
        ) AS p50_response_min,
        ROUND(
          PERCENTILE_CONT(0.9) WITHIN GROUP (
            ORDER BY EXTRACT(EPOCH FROM (first_response_at - reported_at))/60
          ) FILTER (WHERE first_response_at IS NOT NULL)::NUMERIC, 1
        ) AS p90_response_min,
        ROUND(
          AVG(EXTRACT(EPOCH FROM (resolved_at - reported_at))/3600)
          FILTER (WHERE resolved_at IS NOT NULL)::NUMERIC, 2
        ) AS avg_resolution_hr
      FROM analytics.incidents
      WHERE reported_at BETWEEN $1 AND $2
        AND status IN ('resolved', 'closed')
      GROUP BY incident_type, severity
      ORDER BY incident_type, severity DESC
    `, [dateFrom, dateTo]);

    return {
      rows,
      meta: {
        reportType:  'response_time_analysis',
        dateFrom,
        dateTo,
        generatedAt: new Date().toISOString(),
      },
    };
  }

  // ── 5.4.3 Scheduled generation ───────────────────────────────────────────────

  /** Run all scheduled reports that are due (cron: every 5 minutes, checks each definition's schedule). */
  @Cron('*/5 * * * *')
  async runScheduledReports(): Promise<void> {
    const runStartedAt = new Date().toISOString();
    const scheduled = await this.defRepo.find({
      where: { isScheduled: true, isActive: true },
    });

    let triggeredCount = 0;
    for (const def of scheduled) {
      if (!def.cronExpression) continue;
      if (!this.isCronDue(def.cronExpression)) continue;

      this.logger.log(`Running scheduled report: ${def.name}`);
      try {
        await this.triggerReport(def.id, {}, null, 'scheduled');
        triggeredCount += 1;
      } catch (err: any) {
        this.logger.error(`Scheduled report ${def.name} trigger failed: ${err?.message}`);
        this.schedulerSummary = {
          cron: '*/5 * * * *',
          lastRunAt: runStartedAt,
          triggeredCount,
          error: err instanceof Error ? err.message : String(err?.message ?? 'Unknown error'),
        };
      }
    }

    this.schedulerSummary = {
      cron: '*/5 * * * *',
      lastRunAt: runStartedAt,
      triggeredCount,
      error: null,
    };
  }

  getSchedulerSummary() {
    return this.schedulerSummary;
  }

  /** Naive cron-due check: true if "now" falls within the current 5-min window for the expression. */
  private isCronDue(cronExpression: string): boolean {
    try {
      // Simple matching for common schedules used in this platform
      const now = new Date();
      const [minute, hour, , , ] = cronExpression.split(' ');

      if (minute === '0' && hour === '*/6') {
        return now.getMinutes() < 5 && now.getHours() % 6 === 0;
      }
      if (minute === '0' && hour === '1') {
        return now.getMinutes() < 5 && now.getHours() === 1;
      }
      if (minute === '0' && hour === '6') {
        return now.getMinutes() < 5 && now.getHours() === 6;
      }
      // Daily default: run at 06:00
      if (minute === '0' && hour === '6') {
        return now.getMinutes() < 5 && now.getHours() === 6;
      }
      return false;
    } catch {
      return false;
    }
  }
}
