import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken, getDataSourceToken } from '@nestjs/typeorm';
import { Repository, DataSource, ObjectLiteral } from 'typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  NotFoundException,
  ForbiddenException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';

import { AnalyticsService, RequestContext } from './analytics.service';
import { Incident, IncidentStatus, IncidentSeverity } from '../entities/incident.entity';
import { IncidentResponse, ResponseAction } from '../entities/incident-response.entity';
import { ResourceDeployment, ResourceType } from '../entities/resource-deployment.entity';
import { DataCollectionForm, FormStatus } from '../entities/data-collection-form.entity';
import { FormSubmission, SubmissionStatus } from '../entities/form-submission.entity';
import { GeneratedReport } from '../entities/generated-report.entity';
import { AuditService } from '../../audit/services/audit.service';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mockRepo<T extends ObjectLiteral>(entity: new () => T): jest.Mocked<Repository<T>> {
  return {
    create: jest.fn(),
    save: jest.fn(),
    findOne: jest.fn(),
    find: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    increment: jest.fn(),
    createQueryBuilder: jest.fn(),
    count: jest.fn(),
  } as unknown as jest.Mocked<Repository<T>>;
}

function makeIncident(overrides: Partial<Incident> = {}): Incident {
  return Object.assign(new Incident(), {
    id: 'inc-1',
    incidentRef: 'INC-2026-001',
    title: 'Khatlon flood',
    incidentType: 'FLOOD',
    severity: IncidentSeverity.MODERATE,
    status: IncidentStatus.OPEN,
    classification: 1,
    reportedById: 'user-1',
    reportedAt: new Date('2026-01-15'),
    firstResponseAt: null,
    containedAt: null,
    resolvedAt: null,
    closedAt: null,
    affectedPopulation: null,
    affectedAreaKm2: null,
    casualtiesConfirmed: 0,
    casualtiesSuspected: 0,
    attributes: {},
    createdAt: new Date('2026-01-15'),
    updatedAt: new Date('2026-01-15'),
    ...overrides,
  });
}

const CTX_L1: RequestContext = { userId: 'user-1', clearanceLevel: 1 };
const CTX_L5: RequestContext = { userId: 'admin', clearanceLevel: 5 };

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('AnalyticsService', () => {
  let service: AnalyticsService;
  let incidentRepo: jest.Mocked<Repository<Incident>>;
  let responseRepo: jest.Mocked<Repository<IncidentResponse>>;
  let deploymentRepo: jest.Mocked<Repository<ResourceDeployment>>;
  let formRepo: jest.Mocked<Repository<DataCollectionForm>>;
  let submissionRepo: jest.Mocked<Repository<FormSubmission>>;
  let reportRepo: jest.Mocked<Repository<GeneratedReport>>;
  let dataSource: jest.Mocked<DataSource>;
  let auditService: jest.Mocked<AuditService>;
  let events: jest.Mocked<EventEmitter2>;

  beforeEach(async () => {
    incidentRepo    = mockRepo(Incident);
    responseRepo    = mockRepo(IncidentResponse);
    deploymentRepo  = mockRepo(ResourceDeployment);
    formRepo        = mockRepo(DataCollectionForm);
    submissionRepo  = mockRepo(FormSubmission);
    reportRepo      = mockRepo(GeneratedReport);

    dataSource = { query: jest.fn() } as unknown as jest.Mocked<DataSource>;
    auditService = { emit: jest.fn() } as unknown as jest.Mocked<AuditService>;
    events = { emit: jest.fn() } as unknown as jest.Mocked<EventEmitter2>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AnalyticsService,
        { provide: getRepositoryToken(Incident),          useValue: incidentRepo },
        { provide: getRepositoryToken(IncidentResponse),  useValue: responseRepo },
        { provide: getRepositoryToken(ResourceDeployment), useValue: deploymentRepo },
        { provide: getRepositoryToken(DataCollectionForm), useValue: formRepo },
        { provide: getRepositoryToken(FormSubmission),    useValue: submissionRepo },
        { provide: getRepositoryToken(GeneratedReport),   useValue: reportRepo },
        { provide: getDataSourceToken(),                  useValue: dataSource },
        { provide: AuditService,                         useValue: auditService },
        { provide: EventEmitter2,                        useValue: events },
      ],
    }).compile();

    service = module.get<AnalyticsService>(AnalyticsService);
  });

  // ── Incident Registry ─────────────────────────────────────────────────────

  describe('registerIncident', () => {
    const dto = {
      incidentRef: 'INC-2026-001',
      title: 'Khatlon flood',
      incidentType: 'FLOOD',
      classification: 1,
    };

    it('creates incident and emits audit + domain events', async () => {
      incidentRepo.findOne.mockResolvedValue(null);
      const incident = makeIncident();
      incidentRepo.create.mockReturnValue(incident);
      incidentRepo.save.mockResolvedValue(incident);

      const result = await service.registerIncident(dto, CTX_L1);

      expect(incidentRepo.save).toHaveBeenCalled();
      expect(result).toBe(incident);
      expect(auditService.emit).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'analytics.incident.registered',
          resourceId: incident.id,
        }),
      );
      expect(events.emit).toHaveBeenCalledWith(
        'analytics.incident.registered',
        expect.objectContaining({ incidentRef: 'INC-2026-001' }),
      );
    });

    it('throws ConflictException if incidentRef already registered', async () => {
      incidentRepo.findOne.mockResolvedValue(makeIncident());

      await expect(service.registerIncident(dto, CTX_L1)).rejects.toThrow(ConflictException);
    });

    it('defaults severity to MODERATE when not specified', async () => {
      incidentRepo.findOne.mockResolvedValue(null);
      const incident = makeIncident();
      incidentRepo.create.mockReturnValue(incident);
      incidentRepo.save.mockResolvedValue(incident);

      await service.registerIncident(dto, CTX_L1);

      expect(incidentRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ severity: IncidentSeverity.MODERATE }),
      );
    });
  });

  describe('getIncident', () => {
    it('returns incident when found and clearance sufficient', async () => {
      const incident = makeIncident({ classification: 1 });
      incidentRepo.findOne.mockResolvedValue(incident);

      await expect(service.getIncident('inc-1', CTX_L1)).resolves.toBe(incident);
    });

    it('throws NotFoundException when incident does not exist', async () => {
      incidentRepo.findOne.mockResolvedValue(null);
      await expect(service.getIncident('bad-id', CTX_L1)).rejects.toThrow(NotFoundException);
    });

    it('throws ForbiddenException when clearance is insufficient', async () => {
      incidentRepo.findOne.mockResolvedValue(makeIncident({ classification: 5 }));
      await expect(service.getIncident('inc-1', CTX_L1)).rejects.toThrow(ForbiddenException);
    });
  });

  // ── Status Transitions ─────────────────────────────────────────────────────

  describe('updateIncident', () => {
    it('auto-sets firstResponseAt when transitioning to RESPONDING', async () => {
      const incident = makeIncident({ status: IncidentStatus.OPEN });
      incidentRepo.findOne.mockResolvedValue(incident);
      incidentRepo.save.mockImplementation(async (i: any) => i);

      await service.updateIncident('inc-1', { status: IncidentStatus.RESPONDING }, CTX_L1);

      expect(incidentRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ firstResponseAt: expect.any(Date) }),
      );
    });

    it('auto-sets containedAt when transitioning to CONTAINED', async () => {
      const incident = makeIncident({ status: IncidentStatus.RESPONDING });
      incidentRepo.findOne.mockResolvedValue(incident);
      incidentRepo.save.mockImplementation(async (i: any) => i);

      await service.updateIncident('inc-1', { status: IncidentStatus.CONTAINED }, CTX_L1);

      expect(incidentRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ containedAt: expect.any(Date) }),
      );
    });

    it('auto-sets resolvedAt when transitioning to RESOLVED', async () => {
      const incident = makeIncident({ status: IncidentStatus.CONTAINED });
      incidentRepo.findOne.mockResolvedValue(incident);
      incidentRepo.save.mockImplementation(async (i: any) => i);

      await service.updateIncident('inc-1', { status: IncidentStatus.RESOLVED }, CTX_L1);

      expect(incidentRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ resolvedAt: expect.any(Date) }),
      );
    });

    it('does not overwrite firstResponseAt if already set', async () => {
      const existingDate = new Date('2026-01-15T10:00:00Z');
      const incident = makeIncident({
        status: IncidentStatus.RESPONDING,
        firstResponseAt: existingDate,
      });
      incidentRepo.findOne.mockResolvedValue(incident);
      incidentRepo.save.mockImplementation(async (i: any) => i);

      await service.updateIncident('inc-1', { status: IncidentStatus.RESPONDING }, CTX_L1);

      expect(incidentRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ firstResponseAt: existingDate }),
      );
    });

    it('emits status_changed event only when status actually changes', async () => {
      const incident = makeIncident({ status: IncidentStatus.OPEN });
      incidentRepo.findOne.mockResolvedValue(incident);
      incidentRepo.save.mockImplementation(async (i: any) => i);

      await service.updateIncident('inc-1', { status: IncidentStatus.RESPONDING }, CTX_L1);

      expect(events.emit).toHaveBeenCalledWith(
        'analytics.incident.status_changed',
        expect.objectContaining({ previousStatus: IncidentStatus.OPEN, newStatus: IncidentStatus.RESPONDING }),
      );
    });

    it('does NOT emit status_changed event when status is unchanged', async () => {
      const incident = makeIncident({ status: IncidentStatus.OPEN });
      incidentRepo.findOne.mockResolvedValue(incident);
      incidentRepo.save.mockImplementation(async (i: any) => i);

      // Update only severity, not status
      await service.updateIncident('inc-1', { severity: IncidentSeverity.MAJOR }, CTX_L1);

      expect(events.emit).not.toHaveBeenCalled();
    });
  });

  // ── Response Timeline ─────────────────────────────────────────────────────

  describe('recordResponse', () => {
    it('auto-transitions incident to RESPONDING on DISPATCHED action', async () => {
      const incident = makeIncident({ status: IncidentStatus.OPEN });
      incidentRepo.findOne.mockResolvedValue(incident);
      incidentRepo.save.mockImplementation(async (i: any) => i);

      const response = Object.assign(new IncidentResponse(), { id: 'resp-1' });
      responseRepo.create.mockReturnValue(response);
      responseRepo.save.mockResolvedValue(response);

      await service.recordResponse('inc-1', { action: ResponseAction.DISPATCHED }, CTX_L1);

      // updateIncident called internally — check that save was called with RESPONDING status
      expect(incidentRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ status: IncidentStatus.RESPONDING }),
      );
    });

    it('returns saved response record', async () => {
      incidentRepo.findOne.mockResolvedValue(makeIncident({ status: IncidentStatus.RESPONDING }));
      incidentRepo.save.mockImplementation(async (i: any) => i);

      const response = Object.assign(new IncidentResponse(), {
        id: 'resp-1',
        action: ResponseAction.ON_SCENE,
      });
      responseRepo.create.mockReturnValue(response);
      responseRepo.save.mockResolvedValue(response);

      const result = await service.recordResponse('inc-1', { action: ResponseAction.ON_SCENE }, CTX_L1);
      expect(result).toBe(response);
    });
  });

  // ── Resource Deployments ──────────────────────────────────────────────────

  describe('deployResource', () => {
    it('creates deployment record linked to incident', async () => {
      incidentRepo.findOne.mockResolvedValue(makeIncident());

      const deployment = Object.assign(new ResourceDeployment(), { id: 'dep-1' });
      deploymentRepo.create.mockReturnValue(deployment);
      deploymentRepo.save.mockResolvedValue(deployment);

      const result = await service.deployResource(
        'inc-1',
        {
          resourceType: ResourceType.PERSONNEL,
          resourceName: 'SAR Team Alpha',
          quantity: 12,
        },
        CTX_L1,
      );

      expect(deploymentRepo.save).toHaveBeenCalled();
      expect(result).toBe(deployment);
    });
  });

  describe('withdrawResource', () => {
    it('sets withdrawnAt on the deployment', async () => {
      const deployment = Object.assign(new ResourceDeployment(), {
        id: 'dep-1',
        withdrawnAt: null,
      });
      deploymentRepo.findOne.mockResolvedValue(deployment);
      deploymentRepo.save.mockImplementation(async (d: any) => d);

      await service.withdrawResource('dep-1', CTX_L1);

      expect(deploymentRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ withdrawnAt: expect.any(Date) }),
      );
    });

    it('throws ConflictException when resource already withdrawn', async () => {
      deploymentRepo.findOne.mockResolvedValue(
        Object.assign(new ResourceDeployment(), { id: 'dep-1', withdrawnAt: new Date() }),
      );

      await expect(service.withdrawResource('dep-1', CTX_L1)).rejects.toThrow(ConflictException);
    });

    it('throws NotFoundException when deployment not found', async () => {
      deploymentRepo.findOne.mockResolvedValue(null);
      await expect(service.withdrawResource('bad-id', CTX_L1)).rejects.toThrow(NotFoundException);
    });
  });

  // ── Data Collection Forms ─────────────────────────────────────────────────

  describe('createForm', () => {
    it('throws BadRequestException when no fields provided', async () => {
      await expect(
        service.createForm({ name: 'Test', fields: [], classification: 1 }, CTX_L1),
      ).rejects.toThrow(BadRequestException);
    });

    it('creates form with fields', async () => {
      const form = Object.assign(new DataCollectionForm(), { id: 'form-1' });
      formRepo.create.mockReturnValue(form);
      formRepo.save.mockResolvedValue(form);

      const result = await service.createForm(
        {
          name: 'Flood Assessment',
          fields: [{ name: 'water_level', type: 'number', required: true, label: 'Water level (m)' }],
          classification: 1,
        },
        CTX_L1,
      );

      expect(formRepo.save).toHaveBeenCalled();
      expect(result).toBe(form);
    });
  });

  describe('publishForm', () => {
    it('sets status to PUBLISHED', async () => {
      const form = Object.assign(new DataCollectionForm(), {
        id: 'form-1',
        status: FormStatus.DRAFT,
      });
      formRepo.findOne.mockResolvedValue(form);
      formRepo.save.mockImplementation(async (f: any) => f);

      await service.publishForm('form-1', CTX_L1);

      expect(formRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ status: FormStatus.PUBLISHED, publishedAt: expect.any(Date) }),
      );
    });

    it('throws ConflictException when form already published', async () => {
      formRepo.findOne.mockResolvedValue(
        Object.assign(new DataCollectionForm(), { id: 'form-1', status: FormStatus.PUBLISHED }),
      );

      await expect(service.publishForm('form-1', CTX_L1)).rejects.toThrow(ConflictException);
    });
  });

  describe('submitForm', () => {
    const publishedForm = Object.assign(new DataCollectionForm(), {
      id: 'form-1',
      status: FormStatus.PUBLISHED,
      classification: 1,
      fields: [
        { name: 'water_level', required: true, label: 'Water level' },
        { name: 'notes',       required: false, label: 'Notes' },
      ],
    });

    it('throws BadRequestException when required field is missing', async () => {
      formRepo.findOne.mockResolvedValue(publishedForm);

      await expect(
        service.submitForm('form-1', { data: { notes: 'ok' } }, CTX_L1),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws ForbiddenException when clearance is below form classification', async () => {
      const restrictedForm = Object.assign(new DataCollectionForm(), {
        ...publishedForm,
        classification: 5,
      });
      formRepo.findOne.mockResolvedValue(restrictedForm);

      await expect(
        service.submitForm('form-1', { data: { water_level: 2.3 } }, CTX_L1),
      ).rejects.toThrow(ForbiddenException);
    });

    it('saves submission and emits event when all required fields present', async () => {
      formRepo.findOne.mockResolvedValue(publishedForm);

      const submission = Object.assign(new FormSubmission(), { id: 'sub-1', formId: 'form-1' });
      submissionRepo.create.mockReturnValue(submission);
      submissionRepo.save.mockResolvedValue(submission);

      const result = await service.submitForm(
        'form-1',
        { data: { water_level: 2.3, notes: 'Upstream' } },
        CTX_L1,
      );

      expect(submissionRepo.save).toHaveBeenCalled();
      expect(result).toBe(submission);
      expect(events.emit).toHaveBeenCalledWith(
        'analytics.form.submitted',
        expect.objectContaining({ formId: 'form-1' }),
      );
    });
  });

  describe('reviewSubmission', () => {
    it('updates status and records reviewer', async () => {
      const sub = Object.assign(new FormSubmission(), {
        id: 'sub-1',
        status: SubmissionStatus.SUBMITTED,
      });
      submissionRepo.findOne.mockResolvedValue(sub);
      submissionRepo.save.mockImplementation(async (s: any) => s);

      await service.reviewSubmission('sub-1', SubmissionStatus.ACCEPTED, 'Looks good', CTX_L1);

      expect(submissionRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          status: SubmissionStatus.ACCEPTED,
          reviewNotes: 'Looks good',
          reviewedById: CTX_L1.userId,
          reviewedAt: expect.any(Date),
        }),
      );
    });
  });

  // ── Statistical Aggregations ──────────────────────────────────────────────

  describe('getIncidentStats', () => {
    it('builds query with clearance filter', async () => {
      const summaryRow = {
        total_incidents: 10, open_incidents: 3, resolved_incidents: 7,
        catastrophic_count: 0, major_count: 2,
        total_affected_population: 5000, total_casualties: 0,
        avg_response_time_min: 45.2, p50_response_time_min: 38, p90_response_time_min: 90,
        avg_resolution_time_hours: 6.5,
      };
      dataSource.query
        .mockResolvedValueOnce([summaryRow])  // totals
        .mockResolvedValueOnce([])            // byType
        .mockResolvedValueOnce([])            // byRegion
        .mockResolvedValueOnce([]);           // bySeverity

      const result = await service.getIncidentStats({}, CTX_L1) as any;

      const firstSql = dataSource.query.mock.calls[0][0] as string;
      expect(firstSql).toContain('classification <= $1');
      expect(result.summary.total_incidents).toBe(10);
      expect(result.byType).toEqual([]);
    });

    it('applies incidentType filter when provided', async () => {
      dataSource.query
        .mockResolvedValue([{}]);

      await service.getIncidentStats({ incidentType: 'FLOOD' }, CTX_L1);

      const firstSql = dataSource.query.mock.calls[0][0] as string;
      expect(firstSql).toContain('incident_type = $');
      expect(dataSource.query.mock.calls[0][1]).toContain('FLOOD');
    });

    it('applies date range filter when from/to provided', async () => {
      dataSource.query.mockResolvedValue([{}]);

      await service.getIncidentStats({ from: '2026-01-01', to: '2026-03-31' }, CTX_L1);

      const params = dataSource.query.mock.calls[0][1] as any[];
      expect(params.some((p) => p instanceof Date)).toBe(true);
    });
  });

  describe('getResponseTimeMetrics', () => {
    it('returns overall and byType metrics', async () => {
      const overallRow = { sample_size: 50, mean: 42.3, stddev: 15.1, min: 5, p25: 30, p50: 40, p75: 55, p90: 70, p95: 85, max: 180 };
      dataSource.query
        .mockResolvedValueOnce([overallRow])
        .mockResolvedValueOnce([{ incident_type: 'FLOOD', count: 30, mean: 38.5, p50: 36, p90: 65 }]);

      const result = await service.getResponseTimeMetrics({}, CTX_L5) as any;

      expect(result.overall.mean).toBe(42.3);
      expect(result.byType).toHaveLength(1);
    });
  });

  describe('getResourceUtilisation', () => {
    it('returns utilisation aggregated by resource type and name', async () => {
      dataSource.query.mockResolvedValueOnce([
        { resource_type: 'personnel', resource_name: 'SAR Team Alpha', incident_count: 5, total_quantity: 60, avg_deployment_hours: 8.5, total_cost: 15000 },
      ]);

      const result = await service.getResourceUtilisation({}, CTX_L5) as any[];

      expect(result).toHaveLength(1);
      expect(result[0].resource_name).toBe('SAR Team Alpha');
    });
  });

  describe('getTrendAnalysis', () => {
    it('uses correct time bucket for monthly groupBy', async () => {
      dataSource.query.mockResolvedValueOnce([]);

      await service.getTrendAnalysis({ groupBy: 'monthly' }, CTX_L1);

      const params = dataSource.query.mock.calls[0][1] as any[];
      expect(params).toContain('month');
    });

    it('uses correct time bucket for weekly groupBy', async () => {
      dataSource.query.mockResolvedValueOnce([]);

      await service.getTrendAnalysis({ groupBy: 'weekly' }, CTX_L1);

      const params = dataSource.query.mock.calls[0][1] as any[];
      expect(params).toContain('week');
    });
  });

  describe('getSeasonalPattern', () => {
    it('groups by month-of-year across all years', async () => {
      dataSource.query.mockResolvedValueOnce([
        { month: 4, month_name: 'Apr', incident_type: 'FLOOD', incident_count: 8, avg_response_min: 55.0, total_affected_population: 12000 },
      ]);

      const result = await service.getSeasonalPattern({}, CTX_L5) as any[];

      const sql = dataSource.query.mock.calls[0][0] as string;
      expect(sql).toContain('EXTRACT(MONTH');
      expect(result[0].month).toBe(4);
    });
  });

  // ── Metrics snapshot private helper ─────────────────────────────────────────

  describe('getPeriodBounds (via computeMetricsSnapshot)', () => {
    it('sets daily bounds to midnight–23:59 on reference date', async () => {
      const ref = new Date('2026-04-06T15:30:00Z');
      dataSource.query
        .mockResolvedValueOnce([{}])  // snapshot query
        .mockResolvedValueOnce([])    // INSERT snapshot
        .mockResolvedValueOnce([{ incident_type: 'FLOOD' }]) // distinct types
        .mockResolvedValueOnce([{}])  // per-type snapshot query
        .mockResolvedValueOnce([]);   // per-type INSERT

      // Spy on the private helper indirectly via computeMetricsSnapshot
      await service.computeMetricsSnapshot('daily');

      const firstCall = dataSource.query.mock.calls[0];
      const params = firstCall[1] as Date[];
      // from should be start of today, to should be end of today
      expect(params[0].getHours()).toBe(0);
    });
  });

  // ── Report Generation ──────────────────────────────────────────────────────

  describe('requestReport', () => {
    it('creates report in generating state and returns it immediately', async () => {
      const report = Object.assign(new GeneratedReport(), {
        id: 'rep-1',
        status: 'generating',
        reportType: 'incident_summary',
      });
      reportRepo.create.mockReturnValue(report);
      reportRepo.save.mockResolvedValue(report);
      reportRepo.update.mockResolvedValue(undefined as any);
      dataSource.query.mockResolvedValue([{}]);

      const result = await service.requestReport(
        { reportType: 'incident_summary', classification: 1 },
        CTX_L1,
      );

      expect(result.status).toBe('generating');
      expect(reportRepo.save).toHaveBeenCalled();
    });

    it('throws BadRequestException for unknown report type via buildReportData', async () => {
      // getReport needs to find the report
      const report = Object.assign(new GeneratedReport(), { id: 'rep-2', classification: 1 });
      reportRepo.create.mockReturnValue(report);
      reportRepo.save.mockResolvedValue(report);
      reportRepo.update.mockResolvedValue(undefined as any);
      reportRepo.findOne.mockResolvedValue(report);

      await service.requestReport(
        { reportType: 'unknown_type' as any, classification: 1 },
        CTX_L1,
      );

      // generateReport runs via setImmediate; give it a tick
      await new Promise((r) => setImmediate(r));

      expect(reportRepo.update).toHaveBeenCalledWith(
        'rep-2',
        expect.objectContaining({ status: 'failed' }),
      );
    });
  });

  describe('getReport', () => {
    it('throws NotFoundException when report does not exist', async () => {
      reportRepo.findOne.mockResolvedValue(null);
      await expect(service.getReport('bad-id', CTX_L1)).rejects.toThrow(NotFoundException);
    });

    it('throws ForbiddenException when clearance is below report classification', async () => {
      reportRepo.findOne.mockResolvedValue(
        Object.assign(new GeneratedReport(), { id: 'rep-1', classification: 5 }),
      );
      await expect(service.getReport('rep-1', CTX_L1)).rejects.toThrow(ForbiddenException);
    });
  });

  // ── Classification access guard ───────────────────────────────────────────

  describe('classification access enforcement', () => {
    it('blocks access when resource classification exceeds user clearance', async () => {
      incidentRepo.findOne.mockResolvedValue(makeIncident({ classification: 3 }));
      await expect(service.getIncident('inc-1', CTX_L1)).rejects.toThrow(ForbiddenException);
    });

    it('allows access when clearance equals classification', async () => {
      const incident = makeIncident({ classification: 1 });
      incidentRepo.findOne.mockResolvedValue(incident);
      await expect(service.getIncident('inc-1', CTX_L1)).resolves.toBe(incident);
    });

    it('allows access when clearance exceeds classification', async () => {
      const incident = makeIncident({ classification: 3 });
      incidentRepo.findOne.mockResolvedValue(incident);
      await expect(service.getIncident('inc-1', CTX_L5)).resolves.toBe(incident);
    });
  });
});
