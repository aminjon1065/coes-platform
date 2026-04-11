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

  /**
   * Download a ready report as JSON, CSV, XLSX, or PDF (HTML print-ready).
   * Returns { contentType, filename, body } — controller writes body as string or Buffer.
   */
  async downloadReport(
    id: string,
    ctx: RequestContext,
  ): Promise<{ contentType: string; filename: string; body: string | Buffer }> {
    const report = await this.getReport(id, ctx);

    if (report.status !== 'ready') {
      throw new BadRequestException(`Report is not ready (status: ${report.status})`);
    }

    const params = report.parameters as Record<string, unknown>;
    const data = params['result'];

    const safeName = report.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .slice(0, 60);

    const rows = Array.isArray(data)
      ? (data as Record<string, unknown>[])
      : [data as Record<string, unknown>];

    if (report.format === ReportFormat.CSV) {
      return {
        contentType: 'text/csv; charset=utf-8',
        filename: `${safeName}.csv`,
        body: this.toCsv(rows),
      };
    }

    if (report.format === ReportFormat.XLSX) {
      return {
        contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        filename: `${safeName}.xlsx`,
        body: this.toXlsx(rows, report.title),
      };
    }

    if (report.format === ReportFormat.PDF) {
      return {
        contentType: 'text/html; charset=utf-8',
        filename: `${safeName}.html`,
        body: this.toPrintHtml(rows, report.title, report.reportType, report.generatedAt),
      };
    }

    // Default: JSON
    return {
      contentType: 'application/json; charset=utf-8',
      filename: `${safeName}.json`,
      body: JSON.stringify(data, null, 2),
    };
  }

  private toCsv(rows: Record<string, unknown>[]): string {
    if (!rows.length) return '';
    const headers = Object.keys(rows[0]);
    const escape = (v: unknown): string => {
      const s = v === null || v === undefined ? '' : String(v);
      if (s.includes(',') || s.includes('"') || s.includes('\n')) {
        return `"${s.replace(/"/g, '""')}"`;
      }
      return s;
    };
    const lines = [
      headers.join(','),
      ...rows.map((r) => headers.map((h) => escape(r[h])).join(',')),
    ];
    return lines.join('\r\n');
  }

  /**
   * Builds a valid XLSX (Office Open XML) file in-memory without external libraries.
   * Constructs a ZIP archive containing the minimal required OOXML parts.
   */
  private toXlsx(rows: Record<string, unknown>[], sheetTitle: string): Buffer {
    const escXml = (v: unknown): string =>
      (v === null || v === undefined ? '' : String(v))
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');

    const headers = rows.length ? Object.keys(rows[0]) : [];
    const colLetter = (idx: number): string => {
      let s = '';
      let n = idx + 1;
      while (n > 0) {
        const r = (n - 1) % 26;
        s = String.fromCharCode(65 + r) + s;
        n = Math.floor((n - 1) / 26);
      }
      return s;
    };

    // Build shared strings table for string deduplication
    const stringIndex = new Map<string, number>();
    const strings: string[] = [];
    const si = (val: string): number => {
      if (!stringIndex.has(val)) {
        stringIndex.set(val, strings.length);
        strings.push(val);
      }
      return stringIndex.get(val)!;
    };

    // Collect all header strings
    headers.forEach((h) => si(h));

    // Build sheet rows XML, classify cells as number (n) or shared-string (s)
    const sheetRows: string[] = [];

    // Header row (row 1)
    const headerCells = headers
      .map((h, ci) => `<c r="${colLetter(ci)}1" t="s"><v>${si(h)}</v></c>`)
      .join('');
    sheetRows.push(`<row r="1">${headerCells}</row>`);

    // Data rows
    rows.forEach((row, ri) => {
      const rowNum = ri + 2;
      const cells = headers
        .map((h, ci) => {
          const raw = row[h];
          const ref = `${colLetter(ci)}${rowNum}`;
          if (raw === null || raw === undefined) {
            return `<c r="${ref}" t="s"><v>${si('')}</v></c>`;
          }
          if (typeof raw === 'number' || (typeof raw === 'string' && raw !== '' && !isNaN(Number(raw)))) {
            const num = typeof raw === 'number' ? raw : Number(raw);
            return `<c r="${ref}"><v>${num}</v></c>`;
          }
          return `<c r="${ref}" t="s"><v>${si(escXml(raw))}</v></c>`;
        })
        .join('');
      sheetRows.push(`<row r="${rowNum}">${cells}</row>`);
    });

    const sheetXml =
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
      `<sheetData>${sheetRows.join('')}</sheetData>` +
      `</worksheet>`;

    const sharedStringsXml =
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ` +
      `count="${strings.length}" uniqueCount="${strings.length}">` +
      strings.map((s) => `<si><t xml:space="preserve">${s}</t></si>`).join('') +
      `</sst>`;

    const workbookXml =
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ` +
      `xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
      `<sheets><sheet name="${escXml(sheetTitle.slice(0, 31))}" sheetId="1" r:id="rId1"/></sheets>` +
      `</workbook>`;

    const workbookRels =
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
      `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>` +
      `<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/>` +
      `</Relationships>`;

    const rootRels =
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
      `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>` +
      `</Relationships>`;

    const contentTypes =
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
      `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
      `<Default Extension="xml" ContentType="application/xml"/>` +
      `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>` +
      `<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>` +
      `<Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/>` +
      `</Types>`;

    const files: { name: string; data: Buffer }[] = [
      { name: '[Content_Types].xml',          data: Buffer.from(contentTypes,     'utf8') },
      { name: '_rels/.rels',                   data: Buffer.from(rootRels,         'utf8') },
      { name: 'xl/workbook.xml',               data: Buffer.from(workbookXml,      'utf8') },
      { name: 'xl/_rels/workbook.xml.rels',    data: Buffer.from(workbookRels,     'utf8') },
      { name: 'xl/worksheets/sheet1.xml',      data: Buffer.from(sheetXml,         'utf8') },
      { name: 'xl/sharedStrings.xml',          data: Buffer.from(sharedStringsXml, 'utf8') },
    ];

    return this.buildZip(files);
  }

  /**
   * Builds a valid ZIP archive from an array of { name, data } entries.
   * Uses Node.js built-in zlib.deflateRawSync — no external dependencies.
   */
  private buildZip(files: { name: string; data: Buffer }[]): Buffer {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const zlib = require('zlib') as typeof import('zlib');
    const parts: Buffer[] = [];
    const centralDir: Buffer[] = [];
    let offset = 0;

    const crc32 = (buf: Buffer): number => {
      const table = (() => {
        const t = new Uint32Array(256);
        for (let i = 0; i < 256; i++) {
          let c = i;
          for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
          t[i] = c;
        }
        return t;
      })();
      let crc = 0xffffffff;
      for (const byte of buf) crc = table[(crc ^ byte) & 0xff] ^ (crc >>> 8);
      return (crc ^ 0xffffffff) >>> 0;
    };

    const u16 = (n: number): Buffer => { const b = Buffer.alloc(2); b.writeUInt16LE(n, 0); return b; };
    const u32 = (n: number): Buffer => { const b = Buffer.alloc(4); b.writeUInt32LE(n >>> 0, 0); return b; };

    for (const { name, data } of files) {
      const nameBytes   = Buffer.from(name, 'utf8');
      const compressed  = zlib.deflateRawSync(data, { level: 6 });
      const crc         = crc32(data);
      const modTime     = 0x0000;
      const modDate     = 0x0000;

      // Local file header (signature 0x04034b50)
      const localHeader = Buffer.concat([
        Buffer.from([0x50, 0x4b, 0x03, 0x04]), // signature
        u16(20),            // version needed
        u16(0),             // general purpose bit flag
        u16(8),             // compression method: deflate
        u16(modTime),
        u16(modDate),
        u32(crc),
        u32(compressed.length),
        u32(data.length),
        u16(nameBytes.length),
        u16(0),             // extra field length
        nameBytes,
      ]);

      parts.push(localHeader, compressed);

      // Central directory entry (signature 0x02014b50)
      centralDir.push(Buffer.concat([
        Buffer.from([0x50, 0x4b, 0x01, 0x02]), // signature
        u16(20),            // version made by
        u16(20),            // version needed
        u16(0),
        u16(8),
        u16(modTime),
        u16(modDate),
        u32(crc),
        u32(compressed.length),
        u32(data.length),
        u16(nameBytes.length),
        u16(0),             // extra field length
        u16(0),             // file comment length
        u16(0),             // disk number start
        u16(0),             // internal file attributes
        u32(0),             // external file attributes
        u32(offset),        // relative offset of local header
        nameBytes,
      ]));

      offset += localHeader.length + compressed.length;
    }

    const cdBuf     = Buffer.concat(centralDir);
    const cdSize    = cdBuf.length;
    const cdOffset  = offset;
    const count     = files.length;

    // End of central directory record (signature 0x06054b50)
    const eocd = Buffer.concat([
      Buffer.from([0x50, 0x4b, 0x05, 0x06]),
      u16(0),           // disk number
      u16(0),           // disk with central dir
      u16(count),
      u16(count),
      u32(cdSize),
      u32(cdOffset),
      u16(0),           // comment length
    ]);

    return Buffer.concat([...parts, cdBuf, eocd]);
  }

  /**
   * Generates a print-ready HTML report page. Opened in a browser and printed
   * (Ctrl+P → Save as PDF) to produce the PDF deliverable.
   */
  private toPrintHtml(
    rows: Record<string, unknown>[],
    title: string,
    reportType: string,
    generatedAt: Date | null,
  ): string {
    const escHtml = (v: unknown): string =>
      (v === null || v === undefined ? '—' : String(v))
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');

    const headers = rows.length ? Object.keys(rows[0]) : [];
    const formatHeader = (h: string): string =>
      h.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

    const thead = `<tr>${headers.map((h) => `<th>${formatHeader(h)}</th>`).join('')}</tr>`;
    const tbody = rows
      .map((r) => `<tr>${headers.map((h) => `<td>${escHtml(r[h])}</td>`).join('')}</tr>`)
      .join('');

    const genStr = generatedAt
      ? new Date(generatedAt).toLocaleString('en-GB', { timeZone: 'Asia/Dushanbe' })
      : new Date().toLocaleString('en-GB', { timeZone: 'Asia/Dushanbe' });

    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<title>${escHtml(title)}</title>
<style>
  @page { size: A4 landscape; margin: 15mm; }
  body  { font-family: 'Segoe UI', Arial, sans-serif; font-size: 10pt; color: #1a1a2e; margin: 0; }
  h1    { font-size: 14pt; margin-bottom: 2px; }
  .meta { font-size: 8pt; color: #555; margin-bottom: 12px; }
  table { border-collapse: collapse; width: 100%; page-break-inside: auto; }
  thead { background: #1a1a2e; color: #fff; }
  th    { padding: 6px 8px; text-align: left; font-size: 9pt; white-space: nowrap; }
  td    { padding: 5px 8px; border-bottom: 1px solid #e0e0e0; font-size: 9pt; }
  tr:nth-child(even) td { background: #f4f6fb; }
  tr:hover td { background: #e8edf8; }
  @media print {
    body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .no-print { display: none; }
  }
</style>
</head>
<body>
<p class="no-print" style="background:#fffbe6;border:1px solid #f0c040;padding:8px 12px;border-radius:4px;font-size:9pt">
  To save as PDF: press <strong>Ctrl+P</strong> (or Cmd+P on macOS) → select <em>Save as PDF</em> → print.
</p>
<h1>${escHtml(title)}</h1>
<div class="meta">
  Report type: ${escHtml(reportType.replace(/_/g, ' '))} &nbsp;|&nbsp;
  Generated: ${escHtml(genStr)} &nbsp;|&nbsp;
  Rows: ${rows.length} &nbsp;|&nbsp;
  CoESCD Unified Digital Platform
</div>
<table>
  <thead>${thead}</thead>
  <tbody>${tbody}</tbody>
</table>
</body>
</html>`;
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
