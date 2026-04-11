import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository, InjectDataSource } from '@nestjs/typeorm';
import { Repository, DataSource, In } from 'typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';

import { SpatialLayer, LayerStatus, QualityStatus } from '../entities/spatial-layer.entity';
import { SpatialFeature } from '../entities/spatial-feature.entity';
import { HazardZone } from '../entities/hazard-zone.entity';
import { IncidentLocation } from '../entities/incident-location.entity';
import { AdministrativeBoundary } from '../entities/administrative-boundary.entity';

import { AuditService } from '../../audit/services/audit.service';
import { GatewayEventsService } from '../../../infra/events/gateway-events.service';

import {
  CreateSpatialLayerDto,
  UpdateSpatialLayerDto,
  CreateSpatialFeatureDto,
  CreateHazardZoneDto,
  CreateIncidentLocationDto,
  IngestBoundaryDto,
  ListLayersDto,
  BboxQueryDto,
  RadiusQueryDto,
  HazardZoneQueryDto,
  IncidentQueryDto,
} from '../dto';

export interface RequestContext {
  userId: string;
  positionId?: string;
  clearanceLevel: number;
}

@Injectable()
export class GisService {
  private readonly logger = new Logger(GisService.name);

  constructor(
    @InjectRepository(SpatialLayer)
    private readonly layerRepo: Repository<SpatialLayer>,

    @InjectRepository(SpatialFeature)
    private readonly featureRepo: Repository<SpatialFeature>,

    @InjectRepository(HazardZone)
    private readonly hazardZoneRepo: Repository<HazardZone>,

    @InjectRepository(IncidentLocation)
    private readonly incidentRepo: Repository<IncidentLocation>,

    @InjectRepository(AdministrativeBoundary)
    private readonly boundaryRepo: Repository<AdministrativeBoundary>,

    @InjectDataSource()
    private readonly dataSource: DataSource,

    private readonly auditService: AuditService,
    private readonly events: EventEmitter2,
    private readonly gatewayEvents: GatewayEventsService,
  ) {}

  // ── Layer Management ──────────────────────────────────────────────────────

  async createLayer(dto: CreateSpatialLayerDto, ctx: RequestContext): Promise<SpatialLayer> {
    const layer = this.layerRepo.create({
      name: dto.name,
      description: dto.description ?? null,
      geometryType: dto.geometryType,
      srid: dto.srid ?? 4326,
      classification: dto.classification,
      ownerPositionId: dto.ownerPositionId,
      updateCadence: dto.updateCadence,
      sourceName: dto.sourceName ?? null,
      sourceUrl: dto.sourceUrl ?? null,
      keywords: dto.keywords ?? [],
      schemaDefinition: dto.schemaDefinition ?? null,
      symbology: dto.symbology ?? null,
      retentionDays: dto.retentionDays ?? null,
      createdById: ctx.userId,
    });

    const saved = await this.layerRepo.save(layer);

    this.auditService.emit({
      action: 'gis.layer.created',
      actorId: ctx.userId,
      resourceType: 'SpatialLayer',
      resourceId: saved.id,
      metadata: { name: saved.name, geometryType: saved.geometryType },
    });

    this.events.emit('gis.layer.created', { layerId: saved.id, name: saved.name });
    return saved;
  }

  async listLayers(dto: ListLayersDto, ctx: RequestContext): Promise<{ items: SpatialLayer[]; total: number }> {
    const qb = this.layerRepo.createQueryBuilder('l')
      .where('l.classification <= :clearance', { clearance: ctx.clearanceLevel });

    if (dto.status) {
      qb.andWhere('l.status = :status', { status: dto.status });
    }
    if (dto.geometryType) {
      qb.andWhere('l.geometryType = :gt', { gt: dto.geometryType });
    }
    if (dto.keyword) {
      qb.andWhere(
        '(l.name ILIKE :kw OR l.description ILIKE :kw OR :kw = ANY(l.keywords))',
        { kw: `%${dto.keyword}%` },
      );
    }

    const total = await qb.getCount();
    const items = await qb
      .orderBy('l.name', 'ASC')
      .skip(dto.offset ?? 0)
      .take(dto.limit ?? 50)
      .getMany();

    return { items, total };
  }

  async getLayer(id: string, ctx: RequestContext): Promise<SpatialLayer> {
    const layer = await this.layerRepo.findOne({ where: { id } });
    if (!layer) throw new NotFoundException(`Spatial layer ${id} not found`);
    this.assertClassificationAccess(layer.classification, ctx.clearanceLevel, 'layer');
    return layer;
  }

  async publishLayer(id: string, ctx: RequestContext): Promise<SpatialLayer> {
    const layer = await this.getLayer(id, ctx);
    if (layer.status === LayerStatus.ACTIVE) {
      throw new ConflictException('Layer is already active');
    }
    layer.status = LayerStatus.ACTIVE;
    layer.publishedAt = new Date();
    const saved = await this.layerRepo.save(layer);

    this.auditService.emit({
      action: 'gis.layer.published',
      actorId: ctx.userId,
      resourceType: 'SpatialLayer',
      resourceId: id,
    });
    return saved;
  }

  async deprecateLayer(id: string, ctx: RequestContext): Promise<SpatialLayer> {
    const layer = await this.getLayer(id, ctx);
    layer.status = LayerStatus.DEPRECATED;
    layer.deprecatedAt = new Date();
    return this.layerRepo.save(layer);
  }

  async updateLayer(id: string, dto: UpdateSpatialLayerDto, ctx: RequestContext): Promise<SpatialLayer> {
    const layer = await this.getLayer(id, ctx);

    if (dto.name !== undefined) layer.name = dto.name;
    if (dto.description !== undefined) layer.description = dto.description;
    if (dto.classification !== undefined) {
      if (dto.classification < layer.classification) {
        // Downgrading classification requires higher clearance than target level
        this.assertClassificationAccess(layer.classification, ctx.clearanceLevel, 'layer');
      }
      layer.classification = dto.classification;
    }
    if (dto.updateCadence !== undefined) layer.updateCadence = dto.updateCadence;
    if (dto.sourceName !== undefined) layer.sourceName = dto.sourceName;
    if (dto.sourceUrl !== undefined) layer.sourceUrl = dto.sourceUrl;
    if (dto.keywords !== undefined) layer.keywords = dto.keywords;
    if (dto.schemaDefinition !== undefined) layer.schemaDefinition = dto.schemaDefinition;
    if (dto.symbology !== undefined) layer.symbology = dto.symbology;
    if (dto.retentionDays !== undefined) layer.retentionDays = dto.retentionDays;

    const saved = await this.layerRepo.save(layer);

    this.auditService.emit({
      action: 'gis.layer.updated',
      actorId: ctx.userId,
      resourceType: 'SpatialLayer',
      resourceId: id,
      metadata: { changes: Object.keys(dto) },
    });

    return saved;
  }

  // ── Feature Management ────────────────────────────────────────────────────

  async createFeature(dto: CreateSpatialFeatureDto, ctx: RequestContext): Promise<object> {
    const layer = await this.getLayer(dto.layerId, ctx);

    const geojsonStr = JSON.stringify(dto.geometry);

    // Validate GeoJSON is a valid geometry via PostGIS
    const [validRow] = await this.dataSource.query<[{ valid: boolean }]>(
      `SELECT ST_IsValid(ST_GeomFromGeoJSON($1)) AS valid`,
      [geojsonStr],
    );
    if (!validRow?.valid) {
      throw new BadRequestException('Invalid GeoJSON geometry');
    }

    // Insert with PostGIS geometry cast
    const result = await this.dataSource.query<[{ id: string }]>(
      `INSERT INTO gis.spatial_features
         (layer_id, external_id, properties, classification, geometry, valid_from, valid_to, source_ref, created_by_id)
       VALUES
         ($1, $2, $3::jsonb, $4, ST_SetSRID(ST_GeomFromGeoJSON($5), 4326), $6, $7, $8, $9)
       RETURNING id`,
      [
        dto.layerId,
        dto.externalId ?? null,
        JSON.stringify(dto.properties ?? {}),
        dto.classification,
        geojsonStr,
        dto.validFrom ?? null,
        dto.validTo ?? null,
        dto.sourceRef ?? null,
        ctx.userId,
      ],
    );

    const featureId = result[0].id;

    // Increment feature count on the layer
    await this.layerRepo.increment({ id: dto.layerId }, 'featureCount', 1);

    // Refresh layer extent
    await this.refreshLayerExtent(dto.layerId);

    this.auditService.emit({
      action: 'gis.feature.created',
      actorId: ctx.userId,
      resourceType: 'SpatialFeature',
      resourceId: featureId,
      metadata: { layerId: dto.layerId, layerName: layer.name },
    });

    return this.getFeatureAsGeoJson(featureId, ctx);
  }

  async getFeatureAsGeoJson(featureId: string, ctx: RequestContext): Promise<object> {
    const rows = await this.dataSource.query<any[]>(
      `SELECT
         f.id,
         f.layer_id        AS "layerId",
         f.external_id     AS "externalId",
         f.properties,
         f.classification,
         ST_AsGeoJSON(f.geometry)::json AS geometry,
         f.valid_from      AS "validFrom",
         f.valid_to        AS "validTo",
         f.source_ref      AS "sourceRef",
         f.created_at      AS "createdAt"
       FROM gis.spatial_features f
       WHERE f.id = $1`,
      [featureId],
    );
    if (!rows.length) throw new NotFoundException(`Feature ${featureId} not found`);
    const feat = rows[0];
    this.assertClassificationAccess(feat.classification, ctx.clearanceLevel, 'feature');
    return feat;
  }

  async deleteFeature(featureId: string, ctx: RequestContext): Promise<{ deleted: true }> {
    const feat = await this.featureRepo.findOne({ where: { id: featureId } });
    if (!feat) throw new NotFoundException(`Feature ${featureId} not found`);
    this.assertClassificationAccess(feat.classification, ctx.clearanceLevel, 'feature');

    // Soft-delete: set valid_to = now so temporal queries exclude it
    await this.dataSource.query(
      `UPDATE gis.spatial_features SET valid_to = NOW() WHERE id = $1`,
      [featureId],
    );
    await this.layerRepo.decrement({ id: feat.layerId }, 'featureCount', 1);
    await this.refreshLayerExtent(feat.layerId);

    this.auditService.emit({
      action: 'gis.feature.deleted',
      actorId: ctx.userId,
      resourceType: 'SpatialFeature',
      resourceId: featureId,
      metadata: { layerId: feat.layerId },
    });

    return { deleted: true };
  }

  async queryFeaturesByBbox(layerId: string, dto: BboxQueryDto, ctx: RequestContext): Promise<object[]> {
    await this.getLayer(layerId, ctx); // also checks clearance

    const rows = await this.dataSource.query<any[]>(
      `SELECT
         f.id,
         f.external_id     AS "externalId",
         f.properties,
         f.classification,
         ST_AsGeoJSON(f.geometry)::json AS geometry,
         f.valid_from      AS "validFrom",
         f.valid_to        AS "validTo"
       FROM gis.spatial_features f
       WHERE f.layer_id = $1
         AND f.classification <= $2
         AND f.geometry && ST_MakeEnvelope($3, $4, $5, $6, 4326)
         AND f.valid_to IS NULL
       ORDER BY f.created_at DESC
       LIMIT $7`,
      [layerId, ctx.clearanceLevel, dto.minLon, dto.minLat, dto.maxLon, dto.maxLat, dto.limit ?? 200],
    );
    return rows;
  }

  async queryFeaturesByRadius(layerId: string, dto: RadiusQueryDto, ctx: RequestContext): Promise<object[]> {
    await this.getLayer(layerId, ctx);

    // Use UTM-projected geometry for accurate metric distance
    const rows = await this.dataSource.query<any[]>(
      `SELECT
         f.id,
         f.external_id     AS "externalId",
         f.properties,
         f.classification,
         ST_AsGeoJSON(f.geometry)::json AS geometry,
         ST_Distance(
           f.geometry_utm,
           ST_Transform(ST_SetSRID(ST_MakePoint($3, $4), 4326), 32639)
         )::int AS distance_m
       FROM gis.spatial_features f
       WHERE f.layer_id = $1
         AND f.classification <= $2
         AND ST_DWithin(
           f.geometry_utm,
           ST_Transform(ST_SetSRID(ST_MakePoint($3, $4), 4326), 32639),
           $5
         )
         AND f.valid_to IS NULL
       ORDER BY distance_m ASC
       LIMIT $6`,
      [layerId, ctx.clearanceLevel, dto.lon, dto.lat, dto.radiusMetres, dto.limit ?? 100],
    );
    return rows;
  }

  // ── Hazard Zones ──────────────────────────────────────────────────────────

  async createHazardZone(dto: CreateHazardZoneDto, ctx: RequestContext): Promise<HazardZone> {
    // Verify the feature exists and is accessible
    await this.getFeatureAsGeoJson(dto.featureId, ctx);

    const zone = this.hazardZoneRepo.create({
      featureId: dto.featureId,
      hazardClass: dto.hazardClass,
      severity: dto.severity,
      probabilityPct: dto.probabilityPct ?? null,
      returnPeriodYears: dto.returnPeriodYears ?? null,
      affectedPopulation: dto.affectedPopulation ?? null,
      areaHa: dto.areaHa ?? null,
      administrativeCode: dto.administrativeCode ?? null,
      description: dto.description ?? null,
      metadata: dto.metadata ?? {},
      validFrom: dto.validFrom ? new Date(dto.validFrom) : null,
      validTo: dto.validTo ? new Date(dto.validTo) : null,
      classification: dto.classification,
      createdById: ctx.userId,
    });

    const saved = await this.hazardZoneRepo.save(zone);

    this.auditService.emit({
      action: 'gis.hazard_zone.created',
      actorId: ctx.userId,
      resourceType: 'HazardZone',
      resourceId: saved.id,
      metadata: { hazardClass: saved.hazardClass, severity: saved.severity },
    });

    this.events.emit('gis.hazard_zone.created', {
      hazardZoneId: saved.id,
      hazardClass: saved.hazardClass,
      severity: saved.severity,
      administrativeCode: saved.administrativeCode,
    });

    return saved;
  }

  async queryHazardZones(dto: HazardZoneQueryDto, ctx: RequestContext): Promise<object[]> {
    let sql = `
      SELECT
        hz.id,
        hz.feature_id         AS "featureId",
        hz.hazard_class       AS "hazardClass",
        hz.severity,
        hz.probability_pct    AS "probabilityPct",
        hz.return_period_years AS "returnPeriodYears",
        hz.affected_population AS "affectedPopulation",
        hz.area_ha            AS "areaHa",
        hz.administrative_code AS "administrativeCode",
        hz.description,
        hz.valid_from         AS "validFrom",
        hz.valid_to           AS "validTo",
        ST_AsGeoJSON(sf.geometry)::json AS geometry,
        hz.classification,
        hz.created_at         AS "createdAt"
      FROM gis.hazard_zones hz
      JOIN gis.spatial_features sf ON hz.feature_id = sf.id
      WHERE hz.classification <= $1
        AND hz.valid_to IS NULL
    `;
    const params: any[] = [ctx.clearanceLevel];
    let idx = 2;

    if (dto.hazardClass) {
      sql += ` AND hz.hazard_class = $${idx++}`;
      params.push(dto.hazardClass);
    }
    if (dto.severity) {
      sql += ` AND hz.severity = $${idx++}`;
      params.push(dto.severity);
    }
    if (dto.administrativeCode) {
      sql += ` AND hz.administrative_code = $${idx++}`;
      params.push(dto.administrativeCode);
    }
    if (dto.lon !== undefined && dto.lat !== undefined && dto.radiusMetres) {
      sql += ` AND ST_DWithin(
        sf.geometry_utm,
        ST_Transform(ST_SetSRID(ST_MakePoint($${idx++}, $${idx++}), 4326), 32639),
        $${idx++}
      )`;
      params.push(dto.lon, dto.lat, dto.radiusMetres);
    }

    sql += ` ORDER BY hz.created_at DESC LIMIT $${idx}`;
    params.push(dto.limit ?? 100);

    return this.dataSource.query<object[]>(sql, params);
  }

  // ── Incident Locations ────────────────────────────────────────────────────

  async reportIncident(dto: CreateIncidentLocationDto, ctx: RequestContext): Promise<object> {
    const locationGeoJson = JSON.stringify(dto.location);
    const affectedAreaGeoJson = dto.affectedArea ? JSON.stringify(dto.affectedArea) : null;

    // Resolve administrative code if not provided — spatial join against boundaries
    let adminCode = dto.administrativeCode ?? null;
    if (!adminCode) {
      adminCode = await this.resolveAdministrativeCode(locationGeoJson);
    }

    const result = await this.dataSource.query<[{ id: string }]>(
      `INSERT INTO gis.incident_locations
         (incident_ref, title, incident_type, severity, location, affected_area,
          administrative_code, attributes, classification, reported_by_id, reported_at)
       VALUES
         ($1, $2, $3, $4,
          ST_SetSRID(ST_GeomFromGeoJSON($5), 4326),
          ${affectedAreaGeoJson ? 'ST_SetSRID(ST_GeomFromGeoJSON($6), 4326)' : 'NULL'},
          $${affectedAreaGeoJson ? 7 : 6},
          $${affectedAreaGeoJson ? 8 : 7}::jsonb,
          $${affectedAreaGeoJson ? 9 : 8},
          $${affectedAreaGeoJson ? 10 : 9},
          $${affectedAreaGeoJson ? 11 : 10})
       RETURNING id`,
      affectedAreaGeoJson
        ? [
            dto.incidentRef, dto.title, dto.incidentType, dto.severity ?? 'medium',
            locationGeoJson, affectedAreaGeoJson, adminCode,
            JSON.stringify(dto.attributes ?? {}),
            dto.classification, ctx.userId,
            dto.reportedAt ? new Date(dto.reportedAt) : new Date(),
          ]
        : [
            dto.incidentRef, dto.title, dto.incidentType, dto.severity ?? 'medium',
            locationGeoJson, adminCode,
            JSON.stringify(dto.attributes ?? {}),
            dto.classification, ctx.userId,
            dto.reportedAt ? new Date(dto.reportedAt) : new Date(),
          ],
    );

    const incidentId = result[0].id;

    // Enrich: compute elevation, distances asynchronously (fire-and-forget, deferred to next tick
    // so enrichment queries never interleave with the caller's critical path).
    setImmediate(() =>
      this.enrichIncidentLocation(incidentId, locationGeoJson).catch((err) =>
        this.logger.warn(`Incident ${incidentId} enrichment failed: ${err.message}`),
      ),
    );

    this.auditService.emit({
      action: 'gis.incident.reported',
      actorId: ctx.userId,
      resourceType: 'IncidentLocation',
      resourceId: incidentId,
      metadata: {
        incidentRef: dto.incidentRef,
        incidentType: dto.incidentType,
        severity: dto.severity,
        administrativeCode: adminCode,
      },
    });

    this.events.emit('gis.incident.reported', {
      incidentId,
      incidentRef: dto.incidentRef,
      incidentType: dto.incidentType,
      severity: dto.severity ?? 'medium',
      administrativeCode: adminCode,
    });

    const incident = await this.getIncidentAsGeoJson(incidentId, ctx);
    await this.gatewayEvents.publishToRoom('gis.incidents', {
      event: 'gis.incident.reported',
      data: incident,
    });

    return incident;
  }

  async queryIncidents(dto: IncidentQueryDto, ctx: RequestContext): Promise<{ items: object[]; total: number }> {
    let countSql = `
      SELECT COUNT(*)::int AS total
      FROM gis.incident_locations i
      WHERE i.classification <= $1
    `;
    let dataSql = `
      SELECT
        i.id,
        i.incident_ref        AS "incidentRef",
        i.title,
        i.incident_type       AS "incidentType",
        i.severity,
        ST_AsGeoJSON(i.location)::json AS location,
        CASE WHEN i.affected_area IS NOT NULL
             THEN ST_AsGeoJSON(i.affected_area)::json
        END                   AS "affectedArea",
        i.administrative_code AS "administrativeCode",
        i.elevation_m         AS "elevationM",
        i.attributes,
        i.classification,
        i.reported_at         AS "reportedAt",
        i.verified_at         AS "verifiedAt",
        i.resolved_at         AS "resolvedAt",
        i.created_at          AS "createdAt"
      FROM gis.incident_locations i
      WHERE i.classification <= $1
    `;

    const params: any[] = [ctx.clearanceLevel];
    let idx = 2;

    const addFilter = (clause: string, value: any) => {
      countSql += ` AND ${clause}`;
      dataSql  += ` AND ${clause}`;
      params.push(value);
      idx++;
    };

    if (dto.incidentType)      addFilter(`i.incident_type = $${idx}`, dto.incidentType);
    if (dto.severity)          addFilter(`i.severity = $${idx}`, dto.severity);
    if (dto.administrativeCode) addFilter(`i.administrative_code = $${idx}`, dto.administrativeCode);
    if (dto.from)              addFilter(`i.reported_at >= $${idx}`, new Date(dto.from));
    if (dto.to)                addFilter(`i.reported_at <= $${idx}`, new Date(dto.to));
    if (dto.openOnly)          { countSql += ` AND i.resolved_at IS NULL`; dataSql += ` AND i.resolved_at IS NULL`; }

    const [countRow] = await this.dataSource.query<[{ total: number }]>(countSql, params);
    const total = countRow.total;

    dataSql += ` ORDER BY i.reported_at DESC LIMIT $${idx++} OFFSET $${idx}`;
    params.push(dto.limit ?? 50, dto.offset ?? 0);

    const items = await this.dataSource.query<object[]>(dataSql, params);
    return { items, total };
  }

  async getIncidentAsGeoJson(id: string, ctx: RequestContext): Promise<object> {
    const rows = await this.dataSource.query<any[]>(
      `SELECT
         i.id,
         i.incident_ref        AS "incidentRef",
         i.title,
         i.incident_type       AS "incidentType",
         i.severity,
         ST_AsGeoJSON(i.location)::json AS location,
         CASE WHEN i.affected_area IS NOT NULL
              THEN ST_AsGeoJSON(i.affected_area)::json
         END                   AS "affectedArea",
         i.administrative_code AS "administrativeCode",
         i.elevation_m         AS "elevationM",
         i.distance_to_river_m AS "distanceToRiverM",
         i.distance_to_road_m  AS "distanceToRoadM",
         i.attributes,
         i.classification,
         i.reported_by_id      AS "reportedById",
         i.reported_at         AS "reportedAt",
         i.verified_at         AS "verifiedAt",
         i.resolved_at         AS "resolvedAt",
         i.created_at          AS "createdAt"
       FROM gis.incident_locations i
       WHERE i.id = $1`,
      [id],
    );
    if (!rows.length) throw new NotFoundException(`Incident location ${id} not found`);
    const row = rows[0];
    this.assertClassificationAccess(row.classification, ctx.clearanceLevel, 'incident');
    return row;
  }

  async verifyIncident(id: string, ctx: RequestContext): Promise<object> {
    const incident = await this.incidentRepo.findOne({ where: { id } });
    if (!incident) throw new NotFoundException(`Incident ${id} not found`);
    this.assertClassificationAccess(incident.classification, ctx.clearanceLevel, 'incident');
    if (incident.verifiedAt) throw new ConflictException('Incident already verified');

    incident.verifiedAt = new Date();
    (incident as any).verifiedById = ctx.userId;
    await this.incidentRepo.save(incident);

    this.auditService.emit({
      action: 'gis.incident.verified',
      actorId: ctx.userId,
      resourceType: 'IncidentLocation',
      resourceId: id,
    });
    this.events.emit('gis.incident.verified', { incidentId: id, incidentRef: incident.incidentRef, verifiedById: ctx.userId });

    const incidentView = await this.getIncidentAsGeoJson(id, ctx);
    await this.gatewayEvents.publishToRoom('gis.incidents', {
      event: 'gis.incident.verified',
      data: incidentView,
    });

    return incidentView;
  }

  async resolveIncident(id: string, ctx: RequestContext): Promise<object> {
    const incident = await this.incidentRepo.findOne({ where: { id } });
    if (!incident) throw new NotFoundException(`Incident ${id} not found`);
    this.assertClassificationAccess(incident.classification, ctx.clearanceLevel, 'incident');
    if (incident.resolvedAt) throw new ConflictException('Incident already resolved');

    incident.resolvedAt = new Date();
    await this.incidentRepo.save(incident);

    this.auditService.emit({
      action: 'gis.incident.resolved',
      actorId: ctx.userId,
      resourceType: 'IncidentLocation',
      resourceId: id,
    });
    this.events.emit('gis.incident.resolved', { incidentId: id, incidentRef: incident.incidentRef });

    const incidentView = await this.getIncidentAsGeoJson(id, ctx);
    await this.gatewayEvents.publishToRoom('gis.incidents', {
      event: 'gis.incident.resolved',
      data: incidentView,
    });

    return incidentView;
  }

  // ── AI Layer Analyst Review (§12.1) ──────────────────────────────────────

  async approveAiLayer(
    id: string,
    classificationLevel: number,
    ctx: RequestContext,
  ): Promise<SpatialLayer> {
    const layer = await this.layerRepo.findOne({ where: { id } });
    if (!layer) throw new NotFoundException(`Layer ${id} not found`);
    if (!layer.isAiGenerated) throw new ConflictException('Layer is not AI-generated');
    if (layer.status !== LayerStatus.DRAFT) {
      throw new ConflictException(`Cannot approve layer in status "${layer.status}"; expected DRAFT`);
    }

    layer.status = LayerStatus.ACTIVE;
    layer.qualityStatus = QualityStatus.VALID;
    layer.aiApprovedById = ctx.userId;
    layer.aiApprovedAt = new Date();
    layer.publishedAt = new Date();
    if (classificationLevel !== undefined) {
      layer.classification = classificationLevel;
    }

    const saved = await this.layerRepo.save(layer);

    this.auditService.emit({
      action: 'gis.ai_layer.approved',
      actorId: ctx.userId,
      resourceType: 'SpatialLayer',
      resourceId: id,
      metadata: { hazardType: layer.aiHazardType, classification: layer.classification },
    });

    this.events.emit('gis.ai_layer.approved', {
      layerId: id,
      layerName: layer.name,
      hazardType: layer.aiHazardType,
      approvedById: ctx.userId,
      approvedAt: layer.aiApprovedAt.toISOString(),
    });

    // Notify operational map viewers that a new risk layer is active
    this.events.emit('alert.spatial_risk_elevated', {
      source: 'ai_layer_approval',
      layerId: id,
      hazardType: layer.aiHazardType,
      triggeredAt: new Date().toISOString(),
    });

    return saved;
  }

  async rejectAiLayer(
    id: string,
    reason: string,
    ctx: RequestContext,
  ): Promise<SpatialLayer> {
    const layer = await this.layerRepo.findOne({ where: { id } });
    if (!layer) throw new NotFoundException(`Layer ${id} not found`);
    if (!layer.isAiGenerated) throw new ConflictException('Layer is not AI-generated');
    if (layer.status !== LayerStatus.DRAFT) {
      throw new ConflictException(`Cannot reject layer in status "${layer.status}"; expected DRAFT`);
    }
    if (!reason?.trim()) throw new ConflictException('Rejection reason is required');

    layer.status = LayerStatus.DEPRECATED;
    layer.qualityStatus = QualityStatus.INVALID;
    layer.aiRejectionReason = reason.trim();
    layer.deprecatedAt = new Date();

    const saved = await this.layerRepo.save(layer);

    this.auditService.emit({
      action: 'gis.ai_layer.rejected',
      actorId: ctx.userId,
      resourceType: 'SpatialLayer',
      resourceId: id,
      metadata: { hazardType: layer.aiHazardType, reason: layer.aiRejectionReason },
    });

    this.events.emit('gis.ai_layer.rejected', {
      layerId: id,
      layerName: layer.name,
      hazardType: layer.aiHazardType,
      rejectedById: ctx.userId,
      reason: layer.aiRejectionReason,
    });

    return saved;
  }

  // ── Administrative Boundaries ─────────────────────────────────────────────

  async ingestBoundary(dto: IngestBoundaryDto, ctx: RequestContext): Promise<AdministrativeBoundary> {
    const existing = await this.boundaryRepo.findOne({ where: { code: dto.code } });
    if (existing) throw new ConflictException(`Boundary with code ${dto.code} already exists`);

    let parentId: string | null = null;
    if (dto.parentCode) {
      const parent = await this.boundaryRepo.findOne({ where: { code: dto.parentCode } });
      if (!parent) throw new NotFoundException(`Parent boundary ${dto.parentCode} not found`);
      parentId = parent.id;
    }

    const geojsonStr = JSON.stringify(dto.geometry);
    const result = await this.dataSource.query<[{ id: string }]>(
      `INSERT INTO gis.administrative_boundaries
         (code, name_local, name_ru, name_en, admin_level, parent_id, geometry, population, metadata)
       VALUES
         ($1, $2, $3, $4, $5::gis.admin_level, $6,
          ST_SetSRID(ST_GeomFromGeoJSON($7), 4326),
          $8, $9::jsonb)
       RETURNING id`,
      [
        dto.code, dto.nameLocal, dto.nameRu ?? null, dto.nameEn ?? null,
        dto.adminLevel, parentId, geojsonStr,
        dto.population ?? null, JSON.stringify(dto.metadata ?? {}),
      ],
    );

    this.auditService.emit({
      action: 'gis.boundary.ingested',
      actorId: ctx.userId,
      resourceType: 'AdministrativeBoundary',
      resourceId: result[0].id,
      metadata: { code: dto.code, adminLevel: dto.adminLevel },
    });

    return this.boundaryRepo.findOne({ where: { id: result[0].id } }) as Promise<AdministrativeBoundary>;
  }

  async getBoundaryHierarchy(code: string): Promise<AdministrativeBoundary[]> {
    const rows = await this.dataSource.query<AdministrativeBoundary[]>(
      `WITH RECURSIVE hier AS (
         SELECT * FROM gis.administrative_boundaries WHERE code = $1
         UNION ALL
         SELECT b.* FROM gis.administrative_boundaries b
         JOIN hier h ON b.id = h.parent_id
       )
       SELECT id, code, name_local AS "nameLocal", name_en AS "nameEn",
              admin_level AS "adminLevel", parent_id AS "parentId"
       FROM hier
       ORDER BY admin_level`,
      [code],
    );
    if (!rows.length) throw new NotFoundException(`Boundary ${code} not found`);
    return rows;
  }

  async spatialEnrichPoint(lon: number, lat: number): Promise<{
    administrativeCode: string | null;
    administrativeName: string | null;
    adminLevel: string | null;
  }> {
    const rows = await this.dataSource.query<any[]>(
      `SELECT code, name_en AS name, admin_level AS "adminLevel"
       FROM gis.administrative_boundaries
       WHERE ST_Within(ST_SetSRID(ST_MakePoint($1, $2), 4326), geometry)
       ORDER BY
         CASE admin_level
           WHEN 'jamoat'  THEN 1
           WHEN 'rayon'   THEN 2
           WHEN 'oblast'  THEN 3
           WHEN 'country' THEN 4
           ELSE 5
         END
       LIMIT 1`,
      [lon, lat],
    );
    if (!rows.length) {
      return { administrativeCode: null, administrativeName: null, adminLevel: null };
    }
    return {
      administrativeCode: rows[0].code,
      administrativeName: rows[0].name,
      adminLevel: rows[0].adminLevel,
    };
  }

  // ── Materialized View Refresh ─────────────────────────────────────────────

  async refreshIncidentSummary(): Promise<void> {
    await this.dataSource.query(
      `REFRESH MATERIALIZED VIEW CONCURRENTLY gis.mv_incident_summary_by_region`,
    );
    this.logger.log('Refreshed gis.mv_incident_summary_by_region');
  }

  async getIncidentSummaryByRegion(adminLevel?: string, hazardClass?: string): Promise<object[]> {
    let sql = `SELECT * FROM gis.mv_incident_summary_by_region WHERE 1=1`;
    const params: any[] = [];
    let idx = 1;

    if (hazardClass) {
      sql += ` AND incident_type = $${idx++}`;
      params.push(hazardClass);
    }
    sql += ` ORDER BY incident_count DESC`;

    return this.dataSource.query<object[]>(sql, params);
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  private assertClassificationAccess(resourceClass: number, userClearance: number, type: string): void {
    if (resourceClass > userClearance) {
      throw new ForbiddenException(`Insufficient clearance to access ${type} (required: ${resourceClass})`);
    }
  }

  private async resolveAdministrativeCode(locationGeoJson: string): Promise<string | null> {
    try {
      const rows = await this.dataSource.query<[{ code: string }]>(
        `SELECT code FROM gis.administrative_boundaries
         WHERE ST_Within(ST_GeomFromGeoJSON($1), geometry)
         ORDER BY
           CASE admin_level
             WHEN 'jamoat'  THEN 1
             WHEN 'rayon'   THEN 2
             WHEN 'oblast'  THEN 3
             WHEN 'country' THEN 4
             ELSE 5
           END
         LIMIT 1`,
        [locationGeoJson],
      );
      return rows[0]?.code ?? null;
    } catch {
      return null;
    }
  }

  private async enrichIncidentLocation(incidentId: string, locationGeoJson: string): Promise<void> {
    // 1. Elevation — read elevation_mean_m from the finest-grained admin boundary that
    //    contains the incident point (jamoat → rayon → oblast → country fallback).
    const elevRows = await this.dataSource.query<{ elevation_m: string | null }[]>(
      `SELECT (attributes->>'elevation_mean_m')::FLOAT AS elevation_m
       FROM gis.administrative_boundaries
       WHERE ST_Within(ST_GeomFromGeoJSON($1)::geometry, boundary::geometry)
       ORDER BY
         CASE admin_level
           WHEN 'jamoat'  THEN 1
           WHEN 'rayon'   THEN 2
           WHEN 'oblast'  THEN 3
           WHEN 'country' THEN 4
           ELSE 5
         END
       LIMIT 1`,
      [locationGeoJson],
    );
    const elevationM =
      elevRows[0]?.elevation_m !== null && elevRows[0]?.elevation_m !== undefined
        ? Math.round(parseFloat(String(elevRows[0].elevation_m)) * 10) / 10
        : null;

    // 2. Distance to nearest active river / hydro line layer.
    //    Uses the PostGIS KNN operator (<->) for index-accelerated nearest-neighbour.
    const riverRows = await this.dataSource.query<{ dist_m: string | null }[]>(
      `SELECT ST_Distance(
           ST_GeomFromGeoJSON($1)::geography,
           sf.geometry::geography
         ) AS dist_m
       FROM gis.spatial_features sf
       JOIN gis.spatial_layers sl ON sl.id = sf.layer_id
       WHERE sl.status = 'active'
         AND (
           sl.name  ILIKE '%river%'
           OR sl.name  ILIKE '%hydro%'
           OR sl.name  ILIKE '%stream%'
           OR sl.keywords @> ARRAY['river']
           OR sl.keywords @> ARRAY['hydro']
         )
       ORDER BY sf.geometry::geography <-> ST_GeomFromGeoJSON($1)::geography
       LIMIT 1`,
      [locationGeoJson],
    );
    const distanceToRiverM =
      riverRows[0]?.dist_m !== null && riverRows[0]?.dist_m !== undefined
        ? Math.round(parseFloat(String(riverRows[0].dist_m)))
        : null;

    // 3. Distance to nearest active road / transport line layer.
    const roadRows = await this.dataSource.query<{ dist_m: string | null }[]>(
      `SELECT ST_Distance(
           ST_GeomFromGeoJSON($1)::geography,
           sf.geometry::geography
         ) AS dist_m
       FROM gis.spatial_features sf
       JOIN gis.spatial_layers sl ON sl.id = sf.layer_id
       WHERE sl.status = 'active'
         AND (
           sl.name  ILIKE '%road%'
           OR sl.name  ILIKE '%highway%'
           OR sl.name  ILIKE '%transport%'
           OR sl.keywords @> ARRAY['road']
           OR sl.keywords @> ARRAY['transport']
         )
       ORDER BY sf.geometry::geography <-> ST_GeomFromGeoJSON($1)::geography
       LIMIT 1`,
      [locationGeoJson],
    );
    const distanceToRoadM =
      roadRows[0]?.dist_m !== null && roadRows[0]?.dist_m !== undefined
        ? Math.round(parseFloat(String(roadRows[0].dist_m)))
        : null;

    // 4. Distance to nearest settlement / populated place layer.
    const settlementRows = await this.dataSource.query<{ dist_m: string | null }[]>(
      `SELECT ST_Distance(
           ST_GeomFromGeoJSON($1)::geography,
           sf.geometry::geography
         ) AS dist_m
       FROM gis.spatial_features sf
       JOIN gis.spatial_layers sl ON sl.id = sf.layer_id
       WHERE sl.status = 'active'
         AND (
           sl.name  ILIKE '%settlement%'
           OR sl.name  ILIKE '%village%'
           OR sl.name  ILIKE '%town%'
           OR sl.name  ILIKE '%city%'
           OR sl.name  ILIKE '%populated%'
           OR sl.keywords @> ARRAY['settlement']
           OR sl.keywords @> ARRAY['population']
         )
       ORDER BY sf.geometry::geography <-> ST_GeomFromGeoJSON($1)::geography
       LIMIT 1`,
      [locationGeoJson],
    );
    const distanceToSettlementM =
      settlementRows[0]?.dist_m !== null && settlementRows[0]?.dist_m !== undefined
        ? Math.round(parseFloat(String(settlementRows[0].dist_m)))
        : null;

    // 5. Write all enrichment values back to the incident record in one UPDATE.
    await this.dataSource.query(
      `UPDATE gis.incident_locations
         SET elevation_m               = $1,
             distance_to_river_m       = $2,
             distance_to_road_m        = $3,
             distance_to_settlement_m  = $4,
             updated_at                = now()
       WHERE id = $5`,
      [elevationM, distanceToRiverM, distanceToRoadM, distanceToSettlementM, incidentId],
    );

    this.logger.debug(
      `Enriched incident ${incidentId}: ` +
        `elevation=${elevationM}m, river=${distanceToRiverM}m, ` +
        `road=${distanceToRoadM}m, settlement=${distanceToSettlementM}m`,
    );
  }

  private async refreshLayerExtent(layerId: string): Promise<void> {
    try {
      const rows = await this.dataSource.query<[{ extent: string | null }]>(
        `SELECT ST_AsGeoJSON(ST_Extent(geometry))::text AS extent
         FROM gis.spatial_features
         WHERE layer_id = $1`,
        [layerId],
      );
      if (rows[0]?.extent) {
        await this.layerRepo.update(layerId, {
          extentGeojson: JSON.parse(rows[0].extent),
        });
      }
    } catch (err) {
      this.logger.warn(`Failed to refresh extent for layer ${layerId}: ${err.message}`);
    }
  }
}
