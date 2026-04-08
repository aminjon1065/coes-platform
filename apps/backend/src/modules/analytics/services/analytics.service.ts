import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository, InjectDataSource } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';
import { EventEmitter2 } from '@nestjs/event-emitter';

import { Incident, IncidentStatus, IncidentSeverity } from '../entities/incident.entity';
import { IncidentResponse, ResponseAction } from '../entities/incident-response.entity';
import { ResourceDeployment } from '../entities/resource-deployment.entity';
import { DataCollectionForm, FormStatus } from '../entities/data-collection-form.entity';
import { FormSubmission, SubmissionStatus } from '../entities/form-submission.entity';
import { GeneratedReport, ReportFormat } from '../entities/generated-report.entity';

import { AuditService } from '../../audit/services/audit.service';

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

export interface RequestContext {
  userId: string;
  positionId?: string;
  clearanceLevel: number;
}

/** Severity ordering for comparison */
const SEVERITY_RANK: Record<IncidentSeverity, number> = {
  [IncidentSeverity.MINOR]:        1,
  [IncidentSeverity.MODERATE]:     2,
  [IncidentSeverity.MAJOR]:        3,
  [IncidentSeverity.CATASTROPHIC]: 4,
};

@Injectable()
export class AnalyticsService {
  private schedulerSummary = {
    daily: { cron: '0 0 * * *', lastRunAt: null as string | null, error: null as string | null },
    weekly: { cron: '0 0 * * 1', lastRunAt: null as string | null, error: null as string | null },
    monthly: { cron: '0 0 1 * *', lastRunAt: null as string | null, error: null as string | null },
  };
  private readonly logger = new Logger(AnalyticsService.name);

  constructor(
    @InjectRepository(Incident)
    private readonly incidentRepo: Repository<Incident>,

    @InjectRepository(IncidentResponse)
    private readonly responseRepo: Repository<IncidentResponse>,

    @InjectRepository(ResourceDeployment)
    private readonly deploymentRepo: Repository<ResourceDeployment>,

    @InjectRepository(DataCollectionForm)
    private readonly formRepo: Repository<DataCollectionForm>,

    @InjectRepository(FormSubmission)
    private readonly submissionRepo: Repository<FormSubmission>,

    @InjectRepository(GeneratedReport)
    private readonly reportRepo: Repository<GeneratedReport>,

    @InjectDataSource()
    private readonly dataSource: DataSource,

    private readonly auditService: AuditService,
    private readonly events: EventEmitter2,
  ) {}

  // ── Incident Registry ─────────────────────────────────────────────────────

  async registerIncident(dto: RegisterIncidentDto, ctx: RequestContext): Promise<Incident> {
    const existing = await this.incidentRepo.findOne({ where: { incidentRef: dto.incidentRef } });
    if (existing) throw new ConflictException(`Incident ${dto.incidentRef} already registered`);

    const incident = this.incidentRepo.create({
      incidentRef: dto.incidentRef,
      title: dto.title,
      incidentType: dto.incidentType,
      severity: dto.severity ?? IncidentSeverity.MODERATE,
      administrativeCode: dto.administrativeCode ?? null,
      administrativeName: dto.administrativeName ?? null,
      latitude: dto.latitude ?? null,
      longitude: dto.longitude ?? null,
      affectedAreaKm2: dto.affectedAreaKm2 ?? null,
      affectedPopulation: dto.affectedPopulation ?? null,
      attributes: dto.attributes ?? {},
      classification: dto.classification,
      responsibleDeptId: dto.responsibleDeptId ?? null,
      reportedById: ctx.userId,
      reportedAt: dto.reportedAt ? new Date(dto.reportedAt) : new Date(),
    });

    const saved = await this.incidentRepo.save(incident);

    this.auditService.emit({
      action: 'analytics.incident.registered',
      actorId: ctx.userId,
      resourceType: 'Incident',
      resourceId: saved.id,
      metadata: { incidentRef: saved.incidentRef, incidentType: saved.incidentType, severity: saved.severity },
    });
    this.events.emit('analytics.incident.registered', { incidentId: saved.id, incidentRef: saved.incidentRef });
    return saved;
  }

  async updateIncident(id: string, dto: UpdateIncidentDto, ctx: RequestContext): Promise<Incident> {
    const incident = await this.getIncident(id, ctx);

    const prevStatus = incident.status;
    if (dto.severity    !== undefined) incident.severity = dto.severity;
    if (dto.status      !== undefined) incident.status = dto.status;
    if (dto.affectedPopulation  !== undefined) incident.affectedPopulation = dto.affectedPopulation;
    if (dto.casualtiesConfirmed !== undefined) incident.casualtiesConfirmed = dto.casualtiesConfirmed;
    if (dto.casualtiesSuspected !== undefined) incident.casualtiesSuspected = dto.casualtiesSuspected;
    if (dto.affectedAreaKm2     !== undefined) incident.affectedAreaKm2 = dto.affectedAreaKm2;
    if (dto.infrastructureDamage !== undefined) incident.infrastructureDamage = dto.infrastructureDamage;
    if (dto.attributes  !== undefined) incident.attributes = dto.attributes;
    if (dto.internalNotes       !== undefined) incident.internalNotes = dto.internalNotes;
    if (dto.leadResponderId     !== undefined) incident.leadResponderId = dto.leadResponderId;
    if (dto.responsibleDeptId   !== undefined) incident.responsibleDeptId = dto.responsibleDeptId;

    // Auto-set timestamps on status transitions
    const now = new Date();
    if (dto.status === IncidentStatus.RESPONDING && !incident.firstResponseAt) {
      incident.firstResponseAt = now;
    }
    if (dto.status === IncidentStatus.CONTAINED && !incident.containedAt) {
      incident.containedAt = now;
    }
    if (dto.status === IncidentStatus.RESOLVED && !incident.resolvedAt) {
      incident.resolvedAt = now;
    }
    if (dto.status === IncidentStatus.CLOSED && !incident.closedAt) {
      incident.closedAt = now;
    }

    const saved = await this.incidentRepo.save(incident);

    if (prevStatus !== saved.status) {
      this.auditService.emit({
        action: 'analytics.incident.status_changed',
        actorId: ctx.userId,
        resourceType: 'Incident',
        resourceId: id,
        metadata: { from: prevStatus, to: saved.status },
      });
      this.events.emit('analytics.incident.status_changed', {
        incidentId: id,
        incidentRef: saved.incidentRef,
        previousStatus: prevStatus,
        newStatus: saved.status,
      });
    }
    return saved;
  }

  async getIncident(id: string, ctx: RequestContext): Promise<Incident> {
    const incident = await this.incidentRepo.findOne({ where: { id } });
    if (!incident) throw new NotFoundException(`Incident ${id} not found`);
    this.assertClassificationAccess(incident.classification, ctx.clearanceLevel, 'incident');
    return incident;
  }

  async getIncidentByRef(ref: string, ctx: RequestContext): Promise<Incident> {
    const incident = await this.incidentRepo.findOne({ where: { incidentRef: ref } });
    if (!incident) throw new NotFoundException(`Incident ${ref} not found`);
    this.assertClassificationAccess(incident.classification, ctx.clearanceLevel, 'incident');
    return incident;
  }

  async listIncidents(dto: ListIncidentsDto, ctx: RequestContext): Promise<{ items: Incident[]; total: number }> {
    const qb = this.incidentRepo.createQueryBuilder('i')
      .where('i.classification <= :clearance', { clearance: ctx.clearanceLevel });

    if (dto.status)             qb.andWhere('i.status = :status', { status: dto.status });
    if (dto.severity)           qb.andWhere('i.severity = :sev', { sev: dto.severity });
    if (dto.incidentType)       qb.andWhere('i.incidentType = :type', { type: dto.incidentType });
    if (dto.administrativeCode) qb.andWhere('i.administrativeCode = :adminCode', { adminCode: dto.administrativeCode });
    if (dto.from)               qb.andWhere('i.reportedAt >= :from', { from: new Date(dto.from) });
    if (dto.to)                 qb.andWhere('i.reportedAt <= :to', { to: new Date(dto.to) });
    if (dto.openOnly)           qb.andWhere("i.status NOT IN ('closed', 'cancelled')");

    const total = await qb.getCount();
    const items = await qb
      .orderBy('i.reportedAt', 'DESC')
      .skip(dto.offset ?? 0)
      .take(dto.limit ?? 50)
      .getMany();

    return { items, total };
  }

  // ── Response Timeline ─────────────────────────────────────────────────────

  async recordResponse(incidentId: string, dto: RecordResponseDto, ctx: RequestContext): Promise<IncidentResponse> {
    const incident = await this.getIncident(incidentId, ctx);

    const response = this.responseRepo.create({
      incidentId,
      action: dto.action,
      description: dto.description ?? null,
      locationNote: dto.locationNote ?? null,
      occurredAt: dto.occurredAt ? new Date(dto.occurredAt) : new Date(),
      recordedById: ctx.userId,
      resourcesUsed: dto.resourcesUsed ?? [],
      outcome: dto.outcome ?? null,
    });
    const saved = await this.responseRepo.save(response);

    // Auto-transition incident status on key response actions
    const statusMap: Partial<Record<ResponseAction, IncidentStatus>> = {
      [ResponseAction.DISPATCHED]: IncidentStatus.RESPONDING,
      [ResponseAction.ON_SCENE]:   IncidentStatus.RESPONDING,
      [ResponseAction.CONTAINED]:  IncidentStatus.CONTAINED,
    };
    const autoStatus = statusMap[dto.action];
    if (autoStatus && incident.status === IncidentStatus.OPEN) {
      await this.updateIncident(incidentId, { status: autoStatus }, ctx);
    }

    return saved;
  }

  async getResponseTimeline(incidentId: string, ctx: RequestContext): Promise<IncidentResponse[]> {
    await this.getIncident(incidentId, ctx); // access check
    return this.responseRepo.find({
      where: { incidentId },
      order: { occurredAt: 'ASC' },
    });
  }

  // ── Resource Deployments ──────────────────────────────────────────────────

  async deployResource(incidentId: string, dto: DeployResourceDto, ctx: RequestContext): Promise<ResourceDeployment> {
    await this.getIncident(incidentId, ctx);

    const deployment = this.deploymentRepo.create({
      incidentId,
      resourceType: dto.resourceType,
      resourceName: dto.resourceName,
      quantity: dto.quantity ?? 1,
      unit: dto.unit ?? null,
      deptId: dto.deptId ?? null,
      deployedAt: dto.deployedAt ? new Date(dto.deployedAt) : new Date(),
      costEstimate: dto.costEstimate ?? null,
      notes: dto.notes ?? null,
      createdById: ctx.userId,
    });
    return this.deploymentRepo.save(deployment);
  }

  async withdrawResource(deploymentId: string, ctx: RequestContext): Promise<ResourceDeployment> {
    const dep = await this.deploymentRepo.findOne({ where: { id: deploymentId } });
    if (!dep) throw new NotFoundException(`Resource deployment ${deploymentId} not found`);
    if (dep.withdrawnAt) throw new ConflictException('Resource already withdrawn');
    dep.withdrawnAt = new Date();
    return this.deploymentRepo.save(dep);
  }

  async getResourceDeployments(incidentId: string, ctx: RequestContext): Promise<ResourceDeployment[]> {
    await this.getIncident(incidentId, ctx);
    return this.deploymentRepo.find({
      where: { incidentId },
      order: { deployedAt: 'ASC' },
    });
  }

  // ── Statistical Aggregations ──────────────────────────────────────────────

  async getIncidentStats(dto: StatsQueryDto, ctx: RequestContext): Promise<object> {
    const params: any[] = [ctx.clearanceLevel];
    let idx = 2;
    let filter = `WHERE i.classification <= $1`;

    if (dto.incidentType) { filter += ` AND i.incident_type = $${idx++}`; params.push(dto.incidentType); }
    if (dto.administrativeCode) { filter += ` AND i.administrative_code = $${idx++}`; params.push(dto.administrativeCode); }
    if (dto.from) { filter += ` AND i.reported_at >= $${idx++}`; params.push(new Date(dto.from)); }
    if (dto.to)   { filter += ` AND i.reported_at <= $${idx++}`; params.push(new Date(dto.to)); }

    const [totals] = await this.dataSource.query<any[]>(
      `SELECT
         COUNT(*)                                                  AS total_incidents,
         COUNT(*) FILTER (WHERE status NOT IN ('closed','cancelled')) AS open_incidents,
         COUNT(*) FILTER (WHERE status = 'resolved' OR status = 'closed') AS resolved_incidents,
         COUNT(*) FILTER (WHERE severity = 'catastrophic')        AS catastrophic_count,
         COUNT(*) FILTER (WHERE severity = 'major')               AS major_count,
         COALESCE(SUM(affected_population), 0)                    AS total_affected_population,
         COALESCE(SUM(casualties_confirmed), 0)                   AS total_casualties,
         ROUND(AVG(response_time_minutes) FILTER (WHERE response_time_minutes IS NOT NULL), 1)
                                                                   AS avg_response_time_min,
         PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY response_time_minutes)
                                                                   AS p50_response_time_min,
         PERCENTILE_CONT(0.9) WITHIN GROUP (ORDER BY response_time_minutes)
                                                                   AS p90_response_time_min,
         ROUND(AVG(resolution_time_hours) FILTER (WHERE resolution_time_hours IS NOT NULL), 1)
                                                                   AS avg_resolution_time_hours
       FROM analytics.incidents i
       ${filter}`,
      params,
    );

    const byType = await this.dataSource.query<any[]>(
      `SELECT incident_type, COUNT(*) AS count,
              ROUND(AVG(response_time_minutes), 1) AS avg_response_min
       FROM analytics.incidents i ${filter}
       GROUP BY incident_type ORDER BY count DESC`,
      params,
    );

    const byRegion = await this.dataSource.query<any[]>(
      `SELECT administrative_code, administrative_name, COUNT(*) AS count
       FROM analytics.incidents i ${filter}
       WHERE administrative_code IS NOT NULL
       GROUP BY administrative_code, administrative_name
       ORDER BY count DESC LIMIT 20`,
      params,
    );

    const bySeverity = await this.dataSource.query<any[]>(
      `SELECT severity, COUNT(*) AS count
       FROM analytics.incidents i ${filter}
       GROUP BY severity ORDER BY MIN(CASE severity
         WHEN 'catastrophic' THEN 1 WHEN 'major' THEN 2 WHEN 'moderate' THEN 3 ELSE 4 END)`,
      params,
    );

    return {
      summary: totals,
      byType,
      byRegion,
      bySeverity,
    };
  }

  /** Time-series trend analysis — incident counts grouped by time bucket */
  async getTrendAnalysis(dto: StatsQueryDto, ctx: RequestContext): Promise<object[]> {
    const bucketSize = this.normalizeBucket(dto.groupBy ?? 'monthly');
    const params: any[] = [ctx.clearanceLevel];
    let idx = 2;
    let filter = `WHERE i.classification <= $1`;

    if (dto.incidentType)       { filter += ` AND i.incident_type = $${idx++}`;         params.push(dto.incidentType); }
    if (dto.administrativeCode) { filter += ` AND i.administrative_code = $${idx++}`;   params.push(dto.administrativeCode); }
    if (dto.from)               { filter += ` AND i.reported_at >= $${idx++}`;          params.push(new Date(dto.from)); }
    if (dto.to)                 { filter += ` AND i.reported_at <= $${idx++}`;          params.push(new Date(dto.to)); }

    return this.dataSource.query<object[]>(
      `SELECT
         DATE_TRUNC($${idx}, i.reported_at)  AS bucket,
         i.incident_type,
         COUNT(*)                            AS incident_count,
         COALESCE(SUM(i.affected_population), 0) AS affected_population,
         ROUND(AVG(i.response_time_minutes), 1)  AS avg_response_min,
         COUNT(*) FILTER (WHERE i.severity IN ('major','catastrophic')) AS high_severity_count
       FROM analytics.incidents i
       ${filter}
       GROUP BY bucket, i.incident_type
       ORDER BY bucket ASC, incident_count DESC`,
      [...params, bucketSize],
    );
  }

  /** Seasonal pattern analysis — month-of-year aggregation across multiple years */
  async getSeasonalPattern(dto: StatsQueryDto, ctx: RequestContext): Promise<object[]> {
    const params: any[] = [ctx.clearanceLevel];
    let idx = 2;
    let filter = `WHERE i.classification <= $1`;

    if (dto.incidentType)       { filter += ` AND i.incident_type = $${idx++}`;        params.push(dto.incidentType); }
    if (dto.administrativeCode) { filter += ` AND i.administrative_code = $${idx++}`;  params.push(dto.administrativeCode); }
    if (dto.from)               { filter += ` AND i.reported_at >= $${idx++}`;         params.push(new Date(dto.from)); }
    if (dto.to)                 { filter += ` AND i.reported_at <= $${idx++}`;         params.push(new Date(dto.to)); }

    return this.dataSource.query<object[]>(
      `SELECT
         EXTRACT(MONTH FROM i.reported_at)::int  AS month,
         TO_CHAR(i.reported_at, 'Mon')            AS month_name,
         i.incident_type,
         COUNT(*)                                AS incident_count,
         ROUND(AVG(i.response_time_minutes), 1)  AS avg_response_min,
         COALESCE(SUM(i.affected_population), 0) AS total_affected_population
       FROM analytics.incidents i
       ${filter}
       GROUP BY month, month_name, i.incident_type
       ORDER BY month ASC, incident_count DESC`,
      params,
    );
  }

  /** Response time percentiles — for SLA monitoring */
  async getResponseTimeMetrics(dto: StatsQueryDto, ctx: RequestContext): Promise<object> {
    const params: any[] = [ctx.clearanceLevel];
    let idx = 2;
    let filter = `WHERE i.classification <= $1
                    AND i.response_time_minutes IS NOT NULL`;

    if (dto.incidentType)       { filter += ` AND i.incident_type = $${idx++}`;        params.push(dto.incidentType); }
    if (dto.administrativeCode) { filter += ` AND i.administrative_code = $${idx++}`;  params.push(dto.administrativeCode); }
    if (dto.from)               { filter += ` AND i.reported_at >= $${idx++}`;         params.push(new Date(dto.from)); }
    if (dto.to)                 { filter += ` AND i.reported_at <= $${idx++}`;         params.push(new Date(dto.to)); }

    const [row] = await this.dataSource.query<any[]>(
      `SELECT
         COUNT(*)                                                     AS sample_size,
         ROUND(AVG(response_time_minutes), 1)                        AS mean,
         ROUND(STDDEV(response_time_minutes), 1)                     AS stddev,
         MIN(response_time_minutes)                                   AS min,
         PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY response_time_minutes)  AS p25,
         PERCENTILE_CONT(0.5)  WITHIN GROUP (ORDER BY response_time_minutes)  AS p50,
         PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY response_time_minutes)  AS p75,
         PERCENTILE_CONT(0.9)  WITHIN GROUP (ORDER BY response_time_minutes)  AS p90,
         PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY response_time_minutes)  AS p95,
         MAX(response_time_minutes)                                   AS max
       FROM analytics.incidents i
       ${filter}`,
      params,
    );

    const byType = await this.dataSource.query<any[]>(
      `SELECT
         incident_type,
         COUNT(*)                                                     AS count,
         ROUND(AVG(response_time_minutes), 1)                        AS mean,
         PERCENTILE_CONT(0.5)  WITHIN GROUP (ORDER BY response_time_minutes)  AS p50,
         PERCENTILE_CONT(0.9)  WITHIN GROUP (ORDER BY response_time_minutes)  AS p90
       FROM analytics.incidents i
       ${filter}
       GROUP BY incident_type ORDER BY mean DESC`,
      params,
    );

    return { overall: row, byType };
  }

  /** Resource utilisation: what resources were deployed most and for how long */
  async getResourceUtilisation(dto: StatsQueryDto, ctx: RequestContext): Promise<object[]> {
    const params: any[] = [ctx.clearanceLevel];
    let idx = 2;
    let iFilter = `WHERE i.classification <= $1`;

    if (dto.incidentType)       { iFilter += ` AND i.incident_type = $${idx++}`;        params.push(dto.incidentType); }
    if (dto.administrativeCode) { iFilter += ` AND i.administrative_code = $${idx++}`;  params.push(dto.administrativeCode); }
    if (dto.from)               { iFilter += ` AND i.reported_at >= $${idx++}`;         params.push(new Date(dto.from)); }
    if (dto.to)                 { iFilter += ` AND i.reported_at <= $${idx++}`;         params.push(new Date(dto.to)); }

    return this.dataSource.query<object[]>(
      `SELECT
         d.resource_type,
         d.resource_name,
         COUNT(DISTINCT d.incident_id)              AS incident_count,
         SUM(d.quantity)                            AS total_quantity,
         ROUND(AVG(
           EXTRACT(EPOCH FROM (
             COALESCE(d.withdrawn_at, now()) - d.deployed_at
           )) / 3600
         ), 1)                                      AS avg_deployment_hours,
         COALESCE(SUM(d.cost_estimate), 0)          AS total_cost
       FROM analytics.resource_deployments d
       JOIN analytics.incidents i ON i.id = d.incident_id
       ${iFilter}
       GROUP BY d.resource_type, d.resource_name
       ORDER BY incident_count DESC, total_quantity DESC`,
      params,
    );
  }

  // ── Data Collection Forms ─────────────────────────────────────────────────

  async createForm(dto: CreateFormDto, ctx: RequestContext): Promise<DataCollectionForm> {
    if (!dto.fields?.length) throw new BadRequestException('Form must have at least one field');

    const form = this.formRepo.create({
      name: dto.name,
      description: dto.description ?? null,
      incidentType: dto.incidentType ?? null,
      fields: dto.fields,
      classification: dto.classification,
      createdById: ctx.userId,
    });
    return this.formRepo.save(form);
  }

  async publishForm(id: string, ctx: RequestContext): Promise<DataCollectionForm> {
    const form = await this.formRepo.findOne({ where: { id } });
    if (!form) throw new NotFoundException(`Form ${id} not found`);
    if (form.status === FormStatus.PUBLISHED) throw new ConflictException('Form already published');
    form.status = FormStatus.PUBLISHED;
    form.publishedAt = new Date();
    const saved = await this.formRepo.save(form);
    this.auditService.emit({
      action: 'analytics.form.published',
      actorId: ctx.userId,
      resourceType: 'DataCollectionForm',
      resourceId: saved.id,
      metadata: { incidentType: saved.incidentType, classification: saved.classification },
    });
    return saved;
  }

  async listForms(incidentType?: string, ctx?: RequestContext): Promise<DataCollectionForm[]> {
    const qb = this.formRepo.createQueryBuilder('f')
      .where('f.status = :status', { status: FormStatus.PUBLISHED });
    if (ctx) qb.andWhere('f.classification <= :clearance', { clearance: ctx.clearanceLevel });
    if (incidentType) qb.andWhere('(f.incidentType = :type OR f.incidentType IS NULL)', { type: incidentType });
    return qb.orderBy('f.name', 'ASC').getMany();
  }

  async getFormRegistry(ctx: RequestContext): Promise<Array<DataCollectionForm & { submissionCount: number }>> {
    const forms = await this.formRepo.find({
      where: ctx.clearanceLevel >= 0 ? {} : undefined,
      order: { updatedAt: 'DESC', createdAt: 'DESC' },
    });

    const visibleForms = forms.filter((form) => form.classification <= ctx.clearanceLevel);
    if (!visibleForms.length) {
      return [];
    }

    const counts = await this.submissionRepo
      .createQueryBuilder('submission')
      .select('submission.formId', 'formId')
      .addSelect('COUNT(*)', 'count')
      .where('submission.formId IN (:...formIds)', { formIds: visibleForms.map((form) => form.id) })
      .groupBy('submission.formId')
      .getRawMany<{ formId: string; count: string }>();

    const countMap = new Map(counts.map((item) => [item.formId, Number(item.count)]));

    return visibleForms.map((form) => ({
      ...form,
      submissionCount: countMap.get(form.id) ?? 0,
    }));
  }

  async getForm(id: string, ctx: RequestContext): Promise<DataCollectionForm> {
    const form = await this.formRepo.findOne({ where: { id } });
    if (!form) {
      throw new NotFoundException(`Form ${id} not found`);
    }

    this.assertClassificationAccess(form.classification, ctx.clearanceLevel, 'form');
    return form;
  }

  async listFormSubmissions(formId: string, ctx: RequestContext): Promise<FormSubmission[]> {
    await this.getForm(formId, ctx);
    return this.submissionRepo.find({
      where: { formId },
      order: { submittedAt: 'DESC', createdAt: 'DESC' },
    });
  }

  async submitForm(formId: string, dto: SubmitFormDto, ctx: RequestContext): Promise<FormSubmission> {
    const form = await this.formRepo.findOne({ where: { id: formId, status: FormStatus.PUBLISHED } });
    if (!form) throw new NotFoundException(`Published form ${formId} not found`);
    this.assertClassificationAccess(form.classification, ctx.clearanceLevel, 'form');

    // Validate required fields
    const requiredFields = (form.fields as any[]).filter((f) => f.required).map((f) => f.name);
    const data = dto.data as Record<string, unknown>;
    const missing = requiredFields.filter((name) => data[name] === undefined || data[name] === null || data[name] === '');
    if (missing.length) {
      throw new BadRequestException(`Missing required fields: ${missing.join(', ')}`);
    }

    const submission = this.submissionRepo.create({
      formId,
      incidentId: dto.incidentId ?? null,
      incidentRef: dto.incidentRef ?? null,
      data: dto.data,
      locationLat: dto.locationLat ?? null,
      locationLon: dto.locationLon ?? null,
      submittedById: ctx.userId,
    });

    const saved = await this.submissionRepo.save(submission);
    this.events.emit('analytics.form.submitted', {
      submissionId: saved.id,
      formId,
      incidentRef: saved.incidentRef,
      submittedById: ctx.userId,
    });
    this.auditService.emit({
      action: 'analytics.form.submitted',
      actorId: ctx.userId,
      resourceType: 'FormSubmission',
      resourceId: saved.id,
      metadata: { formId, incidentId: saved.incidentId, incidentRef: saved.incidentRef },
    });
    return saved;
  }

  async reviewSubmission(
    id: string,
    status: SubmissionStatus,
    reviewNotes: string | null,
    ctx: RequestContext,
  ): Promise<FormSubmission> {
    const sub = await this.submissionRepo.findOne({ where: { id } });
    if (!sub) throw new NotFoundException(`Submission ${id} not found`);
    sub.status = status;
    sub.reviewNotes = reviewNotes;
    sub.reviewedById = ctx.userId;
    sub.reviewedAt = new Date();
    const saved = await this.submissionRepo.save(sub);
    this.auditService.emit({
      action: 'analytics.form.reviewed',
      actorId: ctx.userId,
      resourceType: 'FormSubmission',
      resourceId: saved.id,
      metadata: { status: saved.status, formId: saved.formId },
    });
    return saved;
  }

  // ── Report Generation ──────────────────────────────────────────────────────

  async requestReport(dto: GenerateReportDto, ctx: RequestContext): Promise<GeneratedReport> {
    const report = this.reportRepo.create({
      title: this.buildReportTitle(dto),
      reportType: dto.reportType,
      parameters: { ...dto },
      format: (dto.format as ReportFormat) ?? ReportFormat.JSON,
      periodFrom: dto.from ? new Date(dto.from) : null,
      periodTo: dto.to ? new Date(dto.to) : null,
      status: 'generating',
      classification: dto.classification ?? ctx.clearanceLevel,
      requestedById: ctx.userId,
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
    });
    const saved = await this.reportRepo.save(report);

    // Generate inline for JSON format; async pipeline for file formats (future)
    setImmediate(() => this.generateReport(saved.id, dto, ctx));
    return saved;
  }

  async getReport(id: string, ctx: RequestContext): Promise<GeneratedReport> {
    const report = await this.reportRepo.findOne({ where: { id } });
    if (!report) throw new NotFoundException(`Report ${id} not found`);
    this.assertClassificationAccess(report.classification, ctx.clearanceLevel, 'report');
    return report;
  }

  async listReports(ctx: RequestContext): Promise<GeneratedReport[]> {
    return this.reportRepo.find({
      where: { requestedById: ctx.userId },
      order: { createdAt: 'DESC' },
      take: 50,
    });
  }

  // ── Metrics Snapshots (Scheduled) ────────────────────────────────────────

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async computeDailyMetricsSnapshot(): Promise<void> {
    await this.computeMetricsSnapshot('daily');
  }

  @Cron('0 0 * * 1') // Every Monday at midnight
  async computeWeeklyMetricsSnapshot(): Promise<void> {
    await this.computeMetricsSnapshot('weekly');
  }

  @Cron('0 0 1 * *') // First of every month
  async computeMonthlyMetricsSnapshot(): Promise<void> {
    await this.computeMetricsSnapshot('monthly');
  }

  async computeMetricsSnapshot(period: 'daily' | 'weekly' | 'monthly'): Promise<void> {
    const now = new Date();
    const { from, to } = this.getPeriodBounds(period, now);

    try {
      // National aggregate
      await this.saveMetricsSnapshot(period, null, null, from, to);

      // Per incident type
      const types = await this.dataSource.query<[{ incident_type: string }]>(
        `SELECT DISTINCT incident_type FROM analytics.incidents
         WHERE reported_at BETWEEN $1 AND $2`,
        [from, to],
      );
      for (const { incident_type } of types) {
        await this.saveMetricsSnapshot(period, null, incident_type, from, to);
      }

      this.logger.log(`Computed ${period} metrics snapshot for ${now.toISOString()}`);
      this.schedulerSummary[period] = {
        ...this.schedulerSummary[period],
        lastRunAt: now.toISOString(),
        error: null,
      };
    } catch (err) {
      this.logger.error(`Failed to compute ${period} metrics snapshot: ${err.message}`);
      this.schedulerSummary[period] = {
        ...this.schedulerSummary[period],
        lastRunAt: now.toISOString(),
        error: err instanceof Error ? err.message : 'Unknown error',
      };
    }
  }

  getSchedulerSummary() {
    return this.schedulerSummary;
  }

  // ── Internal helpers ─────────────────────────────────────────────────────

  private assertClassificationAccess(resource: number, user: number, type: string): void {
    if (resource > user) {
      throw new ForbiddenException(`Insufficient clearance to access ${type}`);
    }
  }

  private normalizeBucket(groupBy: string): string {
    const map: Record<string, string> = {
      daily: 'day', weekly: 'week', monthly: 'month', yearly: 'year',
    };
    return map[groupBy] ?? 'month';
  }

  private getPeriodBounds(period: string, ref: Date): { from: Date; to: Date } {
    const from = new Date(ref);
    const to = new Date(ref);
    if (period === 'daily') {
      from.setHours(0, 0, 0, 0);
      to.setHours(23, 59, 59, 999);
    } else if (period === 'weekly') {
      const day = from.getDay();
      from.setDate(from.getDate() - day);
      from.setHours(0, 0, 0, 0);
      to.setDate(from.getDate() + 6);
      to.setHours(23, 59, 59, 999);
    } else {
      from.setDate(1);
      from.setHours(0, 0, 0, 0);
      to.setMonth(to.getMonth() + 1, 0);
      to.setHours(23, 59, 59, 999);
    }
    return { from, to };
  }

  private async saveMetricsSnapshot(
    period: string,
    adminCode: string | null,
    incidentType: string | null,
    from: Date,
    to: Date,
  ): Promise<void> {
    const params: any[] = [from, to];
    let idx = 3;
    let filter = `WHERE reported_at BETWEEN $1 AND $2`;
    if (adminCode)    { filter += ` AND administrative_code = $${idx++}`; params.push(adminCode); }
    if (incidentType) { filter += ` AND incident_type = $${idx++}`;       params.push(incidentType); }

    const [row] = await this.dataSource.query<any[]>(
      `SELECT
         COUNT(*)                                                     AS total_incidents,
         COUNT(*) FILTER (WHERE status NOT IN ('closed','cancelled')) AS open_incidents,
         COALESCE(SUM(affected_population), 0)                        AS total_affected,
         COALESCE(SUM(casualties_confirmed), 0)                       AS total_casualties,
         ROUND(AVG(response_time_minutes), 1)                         AS avg_response_min,
         PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY response_time_minutes) AS p50_response_min,
         PERCENTILE_CONT(0.9) WITHIN GROUP (ORDER BY response_time_minutes) AS p90_response_min,
         ROUND(AVG(resolution_time_hours), 1)                         AS avg_resolution_hrs
       FROM analytics.incidents ${filter}`,
      params,
    );

    await this.dataSource.query(
      `INSERT INTO analytics.metrics_snapshots
         (snapshot_at, period, administrative_code, incident_type, metrics)
       VALUES ($1, $2, $3, $4, $5::jsonb)
       ON CONFLICT (period, snapshot_at, administrative_code, incident_type)
         DO UPDATE SET metrics = EXCLUDED.metrics`,
      [new Date(), period, adminCode, incidentType, JSON.stringify(row)],
    );
  }

  private async generateReport(
    reportId: string,
    dto: GenerateReportDto,
    ctx: RequestContext,
  ): Promise<void> {
    try {
      const data = await this.buildReportData(dto, ctx);
      const rowCount = Array.isArray(data) ? data.length : 1;
      await this.reportRepo.update(reportId, {
        status: 'ready',
        generatedAt: new Date(),
        rowCount,
        // For JSON format, embed data directly in parameters
        parameters: { ...dto, result: data },
      });
    } catch (err) {
      this.logger.error(`Report ${reportId} generation failed: ${err.message}`);
      await this.reportRepo.update(reportId, {
        status: 'failed',
        errorMessage: err.message,
      });
    }
  }

  private async buildReportData(dto: GenerateReportDto, ctx: RequestContext): Promise<unknown> {
    const queryDto: StatsQueryDto = {
      incidentType: dto.incidentType,
      administrativeCode: dto.administrativeCode,
      from: dto.from,
      to: dto.to,
    };

    switch (dto.reportType) {
      case 'incident_summary':
        return this.getIncidentStats(queryDto, ctx);
      case 'response_performance':
        return this.getResponseTimeMetrics(queryDto, ctx);
      case 'resource_utilisation':
        return this.getResourceUtilisation(queryDto, ctx);
      case 'trend_analysis':
        return this.getTrendAnalysis(queryDto, ctx);
      case 'seasonal_pattern':
        return this.getSeasonalPattern(queryDto, ctx);
      default:
        throw new BadRequestException(`Unknown report type: ${dto.reportType}`);
    }
  }

  private buildReportTitle(dto: GenerateReportDto): string {
    const type = dto.reportType.replace(/_/g, ' ');
    const range = dto.from && dto.to ? ` (${dto.from.slice(0, 10)} to ${dto.to.slice(0, 10)})` : '';
    return `${type.charAt(0).toUpperCase() + type.slice(1)}${range}`;
  }
}
