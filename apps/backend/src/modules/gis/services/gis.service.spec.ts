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

import { GisService, RequestContext } from './gis.service';
import { SpatialLayer, LayerStatus, GeometryType, UpdateCadence } from '../entities/spatial-layer.entity';
import { SpatialFeature } from '../entities/spatial-feature.entity';
import { HazardZone, HazardClass, HazardSeverity } from '../entities/hazard-zone.entity';
import { IncidentLocation } from '../entities/incident-location.entity';
import { AdministrativeBoundary } from '../entities/administrative-boundary.entity';
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

function makeLayer(overrides: Partial<SpatialLayer> = {}): SpatialLayer {
  return Object.assign(new SpatialLayer(), {
    id: 'layer-1',
    name: 'Test Layer',
    description: null,
    geometryType: GeometryType.POINT,
    srid: 4326,
    classification: 1,
    status: LayerStatus.DRAFT,
    featureCount: 0,
    keywords: [],
    createdById: 'user-1',
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    ...overrides,
  });
}

const CTX_L1: RequestContext = { userId: 'user-1', clearanceLevel: 1 };
const CTX_L5: RequestContext = { userId: 'user-5', clearanceLevel: 5 };

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('GisService', () => {
  let service: GisService;
  let layerRepo: jest.Mocked<Repository<SpatialLayer>>;
  let featureRepo: jest.Mocked<Repository<SpatialFeature>>;
  let hazardZoneRepo: jest.Mocked<Repository<HazardZone>>;
  let incidentRepo: jest.Mocked<Repository<IncidentLocation>>;
  let boundaryRepo: jest.Mocked<Repository<AdministrativeBoundary>>;
  let dataSource: jest.Mocked<DataSource>;
  let auditService: jest.Mocked<AuditService>;
  let events: jest.Mocked<EventEmitter2>;

  beforeEach(async () => {
    layerRepo = mockRepo(SpatialLayer);
    featureRepo = mockRepo(SpatialFeature);
    hazardZoneRepo = mockRepo(HazardZone);
    incidentRepo = mockRepo(IncidentLocation);
    boundaryRepo = mockRepo(AdministrativeBoundary);

    dataSource = {
      query: jest.fn(),
    } as unknown as jest.Mocked<DataSource>;

    auditService = { emit: jest.fn() } as unknown as jest.Mocked<AuditService>;
    events = { emit: jest.fn() } as unknown as jest.Mocked<EventEmitter2>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GisService,
        { provide: getRepositoryToken(SpatialLayer),         useValue: layerRepo },
        { provide: getRepositoryToken(SpatialFeature),       useValue: featureRepo },
        { provide: getRepositoryToken(HazardZone),           useValue: hazardZoneRepo },
        { provide: getRepositoryToken(IncidentLocation),     useValue: incidentRepo },
        { provide: getRepositoryToken(AdministrativeBoundary), useValue: boundaryRepo },
        { provide: getDataSourceToken(),                     useValue: dataSource },
        { provide: AuditService,                             useValue: auditService },
        { provide: EventEmitter2,                            useValue: events },
      ],
    }).compile();

    service = module.get<GisService>(GisService);
  });

  // ── Layer Management ────────────────────────────────────────────────────────

  describe('createLayer', () => {
    it('creates and returns a spatial layer', async () => {
      const layer = makeLayer();
      layerRepo.create.mockReturnValue(layer);
      layerRepo.save.mockResolvedValue(layer);

      const result = await service.createLayer(
        {
          name: 'Test Layer',
          geometryType: GeometryType.POINT,
          classification: 1,
          ownerPositionId: 'pos-1',
          updateCadence: UpdateCadence.DAILY,
        },
        CTX_L1,
      );

      expect(layerRepo.save).toHaveBeenCalledWith(layer);
      expect(result).toBe(layer);
      expect(auditService.emit).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'gis.layer.created', resourceId: layer.id }),
      );
      expect(events.emit).toHaveBeenCalledWith('gis.layer.created', expect.objectContaining({ layerId: layer.id }));
    });
  });

  describe('listLayers', () => {
    it('applies clearance and status filters via query builder', async () => {
      const qb = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getCount: jest.fn().mockResolvedValue(2),
        getMany: jest.fn().mockResolvedValue([makeLayer(), makeLayer({ id: 'layer-2' })]),
      };
      layerRepo.createQueryBuilder.mockReturnValue(qb as any);

      const result = await service.listLayers({ status: LayerStatus.ACTIVE }, CTX_L1);

      expect(qb.where).toHaveBeenCalledWith('l.classification <= :clearance', { clearance: 1 });
      expect(qb.andWhere).toHaveBeenCalledWith('l.status = :status', { status: LayerStatus.ACTIVE });
      expect(result.total).toBe(2);
      expect(result.items).toHaveLength(2);
    });

    it('applies keyword filter when provided', async () => {
      const qb = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getCount: jest.fn().mockResolvedValue(0),
        getMany: jest.fn().mockResolvedValue([]),
      };
      layerRepo.createQueryBuilder.mockReturnValue(qb as any);

      await service.listLayers({ keyword: 'flood' }, CTX_L1);

      expect(qb.andWhere).toHaveBeenCalledWith(
        expect.stringContaining('ILIKE'),
        expect.objectContaining({ kw: '%flood%' }),
      );
    });
  });

  describe('getLayer', () => {
    it('returns layer when found and clearance is sufficient', async () => {
      const layer = makeLayer({ classification: 1 });
      layerRepo.findOne.mockResolvedValue(layer);

      const result = await service.getLayer('layer-1', CTX_L1);
      expect(result).toBe(layer);
    });

    it('throws NotFoundException when layer does not exist', async () => {
      layerRepo.findOne.mockResolvedValue(null);
      await expect(service.getLayer('bad-id', CTX_L1)).rejects.toThrow(NotFoundException);
    });

    it('throws ForbiddenException when user clearance is insufficient', async () => {
      const layer = makeLayer({ classification: 5 });
      layerRepo.findOne.mockResolvedValue(layer);

      await expect(service.getLayer('layer-1', CTX_L1)).rejects.toThrow(ForbiddenException);
    });
  });

  describe('publishLayer', () => {
    it('sets status to ACTIVE and records publishedAt', async () => {
      const layer = makeLayer({ status: LayerStatus.DRAFT });
      layerRepo.findOne.mockResolvedValue(layer);
      layerRepo.save.mockResolvedValue({ ...layer, status: LayerStatus.ACTIVE });

      const result = await service.publishLayer('layer-1', CTX_L1);

      expect(layerRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ status: LayerStatus.ACTIVE }),
      );
      expect(auditService.emit).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'gis.layer.published' }),
      );
    });

    it('throws ConflictException when layer is already ACTIVE', async () => {
      const layer = makeLayer({ status: LayerStatus.ACTIVE });
      layerRepo.findOne.mockResolvedValue(layer);

      await expect(service.publishLayer('layer-1', CTX_L1)).rejects.toThrow(ConflictException);
    });
  });

  describe('deprecateLayer', () => {
    it('sets status to DEPRECATED', async () => {
      const layer = makeLayer({ status: LayerStatus.ACTIVE });
      layerRepo.findOne.mockResolvedValue(layer);
      layerRepo.save.mockResolvedValue({ ...layer, status: LayerStatus.DEPRECATED });

      await service.deprecateLayer('layer-1', CTX_L1);

      expect(layerRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ status: LayerStatus.DEPRECATED }),
      );
    });
  });

  // ── Feature Management ─────────────────────────────────────────────────────

  describe('createFeature', () => {
    const validGeometry = { type: 'Point', coordinates: [71.0, 38.8] };

    beforeEach(() => {
      // getLayer must succeed (clearance 1, layer classification 1)
      layerRepo.findOne.mockResolvedValue(makeLayer());
    });

    it('rejects invalid GeoJSON geometry', async () => {
      dataSource.query
        .mockResolvedValueOnce([{ valid: false }]); // ST_IsValid check

      await expect(
        service.createFeature(
          { layerId: 'layer-1', geometry: validGeometry, classification: 1, properties: {} },
          CTX_L1,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('inserts feature and refreshes layer extent on valid geometry', async () => {
      dataSource.query
        .mockResolvedValueOnce([{ valid: true }])           // ST_IsValid
        .mockResolvedValueOnce([{ id: 'feat-1' }])          // INSERT RETURNING id
        .mockResolvedValueOnce([{ id: 'feat-1', geometry: validGeometry, classification: 1 }]) // getFeatureAsGeoJson
        .mockResolvedValueOnce([{ extent: '{"type":"Point"}' }]); // refreshLayerExtent

      layerRepo.increment.mockResolvedValue(undefined as any);
      layerRepo.update.mockResolvedValue(undefined as any);

      const result = await service.createFeature(
        { layerId: 'layer-1', geometry: validGeometry, classification: 1, properties: {} },
        CTX_L1,
      );

      expect(dataSource.query).toHaveBeenCalledWith(
        expect.stringContaining('ST_IsValid'),
        expect.any(Array),
      );
      expect(layerRepo.increment).toHaveBeenCalledWith({ id: 'layer-1' }, 'featureCount', 1);
      expect(auditService.emit).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'gis.feature.created' }),
      );
    });
  });

  // ── Hazard Zones ───────────────────────────────────────────────────────────

  describe('createHazardZone', () => {
    it('creates hazard zone and emits event', async () => {
      // getFeatureAsGeoJson must succeed
      layerRepo.findOne.mockResolvedValue(makeLayer());
      dataSource.query.mockResolvedValueOnce([{ id: 'feat-1', classification: 1 }]);

      const zone = Object.assign(new HazardZone(), {
        id: 'zone-1',
        hazardClass: HazardClass.FLOOD,
        severity: HazardSeverity.HIGH,
        classification: 1,
      });
      hazardZoneRepo.create.mockReturnValue(zone);
      hazardZoneRepo.save.mockResolvedValue(zone);

      await service.createHazardZone(
        {
          featureId: 'feat-1',
          hazardClass: HazardClass.FLOOD,
          severity: HazardSeverity.HIGH,
          classification: 1,
        },
        CTX_L1,
      );

      expect(hazardZoneRepo.save).toHaveBeenCalled();
      expect(events.emit).toHaveBeenCalledWith(
        'gis.hazard_zone.created',
        expect.objectContaining({ hazardZoneId: 'zone-1', hazardClass: HazardClass.FLOOD }),
      );
    });
  });

  // ── Incident Locations ─────────────────────────────────────────────────────

  describe('reportIncident', () => {
    const location = { type: 'Point', coordinates: [71.0, 38.8] };

    it('inserts incident, emits event, and returns GeoJSON', async () => {
      dataSource.query
        .mockResolvedValueOnce([])                            // resolveAdministrativeCode (no match)
        .mockResolvedValueOnce([{ id: 'inc-1' }])           // INSERT incident
        .mockResolvedValueOnce([{ id: 'inc-1', classification: 1, location, incidentType: 'FLOOD' }]); // getIncidentAsGeoJson

      const result = await service.reportIncident(
        {
          incidentRef: 'INC-2026-001',
          title: 'Khatlon flood',
          incidentType: 'FLOOD',
          location,
          classification: 1,
        },
        CTX_L1,
      );

      expect(dataSource.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO gis.incident_locations'),
        expect.any(Array),
      );
      expect(auditService.emit).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'gis.incident.reported' }),
      );
      expect(events.emit).toHaveBeenCalledWith(
        'gis.incident.reported',
        expect.objectContaining({ incidentRef: 'INC-2026-001' }),
      );
    });

    it('uses provided administrativeCode without spatial join', async () => {
      dataSource.query
        .mockResolvedValueOnce([{ id: 'inc-2' }])
        .mockResolvedValueOnce([{ id: 'inc-2', classification: 1, location }]);

      await service.reportIncident(
        {
          incidentRef: 'INC-2026-002',
          title: 'Test incident',
          incidentType: 'LANDSLIDE',
          location,
          classification: 1,
          administrativeCode: 'TJ-KH',
        },
        CTX_L1,
      );

      // Should NOT call resolveAdministrativeCode (no extra query for boundary lookup)
      const calls = dataSource.query.mock.calls;
      expect(calls.some(([sql]) => sql.includes('administrative_boundaries'))).toBe(false);
    });
  });

  describe('queryIncidents', () => {
    it('returns paginated incidents with clearance filter', async () => {
      dataSource.query
        .mockResolvedValueOnce([{ total: 5 }])    // COUNT query
        .mockResolvedValueOnce([{}, {}, {}]);      // data query

      const result = await service.queryIncidents({ limit: 3, offset: 0 }, CTX_L1);

      expect(result.total).toBe(5);
      expect(result.items).toHaveLength(3);

      const countCall = dataSource.query.mock.calls[0][0] as string;
      expect(countCall).toContain('classification <= $1');
    });
  });

  describe('resolveIncident', () => {
    it('sets resolvedAt and emits event', async () => {
      const incident = Object.assign(new IncidentLocation(), {
        id: 'inc-1',
        classification: 1,
        resolvedAt: null,
        incidentRef: 'INC-001',
      });
      incidentRepo.findOne.mockResolvedValue(incident);
      incidentRepo.save.mockResolvedValue({ ...incident, resolvedAt: new Date() });
      dataSource.query.mockResolvedValue([{ id: 'inc-1', classification: 1 }]);

      await service.resolveIncident('inc-1', CTX_L1);

      expect(incidentRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ resolvedAt: expect.any(Date) }),
      );
      expect(events.emit).toHaveBeenCalledWith(
        'gis.incident.resolved',
        expect.objectContaining({ incidentId: 'inc-1' }),
      );
    });

    it('throws ConflictException when incident already resolved', async () => {
      incidentRepo.findOne.mockResolvedValue(
        Object.assign(new IncidentLocation(), {
          id: 'inc-1',
          classification: 1,
          resolvedAt: new Date(),
        }),
      );

      await expect(service.resolveIncident('inc-1', CTX_L1)).rejects.toThrow(ConflictException);
    });
  });

  // ── Administrative Boundaries ──────────────────────────────────────────────

  describe('ingestBoundary', () => {
    const dto = {
      code: 'TJ-KH',
      nameLocal: 'Хатлон',
      adminLevel: 'oblast' as any,
      geometry: { type: 'Polygon', coordinates: [[[67, 37], [72, 37], [72, 39], [67, 39], [67, 37]]] },
    };

    it('throws ConflictException if boundary code already exists', async () => {
      boundaryRepo.findOne
        .mockResolvedValueOnce(Object.assign(new AdministrativeBoundary(), { id: 'b-1', code: 'TJ-KH' }));

      await expect(service.ingestBoundary(dto, CTX_L1)).rejects.toThrow(ConflictException);
    });

    it('throws NotFoundException if parentCode does not exist', async () => {
      boundaryRepo.findOne
        .mockResolvedValueOnce(null)   // code check — not duplicate
        .mockResolvedValueOnce(null);  // parent lookup — not found

      await expect(
        service.ingestBoundary({ ...dto, parentCode: 'TJ' }, CTX_L1),
      ).rejects.toThrow(NotFoundException);
    });

    it('inserts boundary and emits audit event on success', async () => {
      boundaryRepo.findOne
        .mockResolvedValueOnce(null)   // not duplicate
        .mockResolvedValueOnce(Object.assign(new AdministrativeBoundary(), { id: 'b-0', code: 'TJ' })) // getInserted
        .mockResolvedValueOnce(Object.assign(new AdministrativeBoundary(), { id: 'b-2', code: 'TJ-KH' }));

      dataSource.query.mockResolvedValueOnce([{ id: 'b-2' }]); // INSERT RETURNING

      await service.ingestBoundary({ ...dto, parentCode: 'TJ' }, CTX_L1);

      expect(dataSource.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO gis.administrative_boundaries'),
        expect.any(Array),
      );
      expect(auditService.emit).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'gis.boundary.ingested', metadata: expect.objectContaining({ code: 'TJ-KH' }) }),
      );
    });
  });

  // ── Spatial Enrichment ─────────────────────────────────────────────────────

  describe('spatialEnrichPoint', () => {
    it('returns boundary info when point falls within a boundary', async () => {
      dataSource.query.mockResolvedValueOnce([
        { code: 'TJ-KH', name: 'Khatlon', adminLevel: 'oblast' },
      ]);

      const result = await service.spatialEnrichPoint(69.0, 37.5);

      expect(result.administrativeCode).toBe('TJ-KH');
      expect(result.administrativeName).toBe('Khatlon');
      expect(result.adminLevel).toBe('oblast');
    });

    it('returns nulls when no boundary contains the point', async () => {
      dataSource.query.mockResolvedValueOnce([]);

      const result = await service.spatialEnrichPoint(0, 0);

      expect(result.administrativeCode).toBeNull();
      expect(result.administrativeName).toBeNull();
      expect(result.adminLevel).toBeNull();
    });
  });

  // ── Classification access guard ────────────────────────────────────────────

  describe('classification access enforcement', () => {
    it('allows access when user clearance equals resource classification', async () => {
      const layer = makeLayer({ classification: 3 });
      layerRepo.findOne.mockResolvedValue(layer);

      const ctx: RequestContext = { userId: 'u', clearanceLevel: 3 };
      await expect(service.getLayer('layer-1', ctx)).resolves.toBe(layer);
    });

    it('allows access when user clearance exceeds resource classification', async () => {
      const layer = makeLayer({ classification: 2 });
      layerRepo.findOne.mockResolvedValue(layer);

      await expect(service.getLayer('layer-1', CTX_L5)).resolves.toBe(layer);
    });

    it('denies access when user clearance is below resource classification', async () => {
      const layer = makeLayer({ classification: 3 });
      layerRepo.findOne.mockResolvedValue(layer);

      await expect(service.getLayer('layer-1', CTX_L1)).rejects.toThrow(ForbiddenException);
    });
  });

  // ── Hazard zone query ──────────────────────────────────────────────────────

  describe('queryHazardZones', () => {
    it('filters by hazard class and clearance', async () => {
      dataSource.query.mockResolvedValueOnce([{ id: 'hz-1', hazardClass: 'FLOOD' }]);

      const result = await service.queryHazardZones({ hazardClass: 'FLOOD' as any }, CTX_L1);

      const sql = dataSource.query.mock.calls[0][0] as string;
      expect(sql).toContain('hz.classification <= $1');
      expect(sql).toContain('hz.hazard_class = $');
      expect(result).toHaveLength(1);
    });

    it('applies radius filter when lon/lat/radius provided', async () => {
      dataSource.query.mockResolvedValueOnce([]);

      await service.queryHazardZones(
        { lon: 71.0, lat: 38.8, radiusMetres: 50000 },
        CTX_L1,
      );

      const sql = dataSource.query.mock.calls[0][0] as string;
      expect(sql).toContain('ST_DWithin');
    });
  });
});
