import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  ParseUUIDPipe,
  Query,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';

import { GisService } from '../services/gis.service';
import { CurrentUser } from '../../iam/decorators/current-user.decorator';

import {
  CreateSpatialLayerDto,
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

interface JwtPayload {
  sub: string;
  positionId?: string;
  clearanceLevel?: number;
}

function toCtx(user: JwtPayload) {
  return {
    userId: user.sub,
    positionId: user.positionId,
    clearanceLevel: user.clearanceLevel ?? 0,
  };
}

@ApiTags('GIS')
@ApiBearerAuth()
@Controller('gis')
export class GisController {
  constructor(private readonly gisService: GisService) {}

  // ── Layers ────────────────────────────────────────────────────────────────

  @ApiOperation({ summary: 'Register a new spatial layer in the catalog' })
  @Post('layers')
  createLayer(
    @Body() dto: CreateSpatialLayerDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.gisService.createLayer(dto, toCtx(user));
  }

  @ApiOperation({ summary: 'List spatial layers (clearance-filtered)' })
  @Get('layers')
  listLayers(
    @Query() dto: ListLayersDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.gisService.listLayers(dto, toCtx(user));
  }

  @ApiOperation({ summary: 'Get a single spatial layer by ID' })
  @Get('layers/:id')
  getLayer(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.gisService.getLayer(id, toCtx(user));
  }

  @ApiOperation({ summary: 'Publish (activate) a draft spatial layer' })
  @Patch('layers/:id/publish')
  publishLayer(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.gisService.publishLayer(id, toCtx(user));
  }

  @ApiOperation({ summary: 'Deprecate a spatial layer' })
  @Patch('layers/:id/deprecate')
  deprecateLayer(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.gisService.deprecateLayer(id, toCtx(user));
  }

  // ── Features ──────────────────────────────────────────────────────────────

  @ApiOperation({ summary: 'Add a spatial feature to a layer' })
  @Post('features')
  createFeature(
    @Body() dto: CreateSpatialFeatureDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.gisService.createFeature(dto, toCtx(user));
  }

  @ApiOperation({ summary: 'Get a single feature as GeoJSON' })
  @Get('features/:id')
  getFeature(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.gisService.getFeatureAsGeoJson(id, toCtx(user));
  }

  @ApiOperation({ summary: 'Query features in a layer by bounding box' })
  @Get('layers/:id/features/bbox')
  queryByBbox(
    @Param('id', ParseUUIDPipe) layerId: string,
    @Query() dto: BboxQueryDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.gisService.queryFeaturesByBbox(layerId, dto, toCtx(user));
  }

  @ApiOperation({ summary: 'Query features in a layer within a radius (metres)' })
  @Get('layers/:id/features/radius')
  queryByRadius(
    @Param('id', ParseUUIDPipe) layerId: string,
    @Query() dto: RadiusQueryDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.gisService.queryFeaturesByRadius(layerId, dto, toCtx(user));
  }

  // ── Hazard Zones ──────────────────────────────────────────────────────────

  @ApiOperation({ summary: 'Create a hazard zone record linked to a spatial feature' })
  @Post('hazard-zones')
  createHazardZone(
    @Body() dto: CreateHazardZoneDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.gisService.createHazardZone(dto, toCtx(user));
  }

  @ApiOperation({ summary: 'Query hazard zones with optional spatial and attribute filters' })
  @Get('hazard-zones')
  queryHazardZones(
    @Query() dto: HazardZoneQueryDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.gisService.queryHazardZones(dto, toCtx(user));
  }

  // ── Incident Locations ────────────────────────────────────────────────────

  @ApiOperation({ summary: 'Report an incident location (spatial record)' })
  @Post('incidents')
  reportIncident(
    @Body() dto: CreateIncidentLocationDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.gisService.reportIncident(dto, toCtx(user));
  }

  @ApiOperation({ summary: 'Query incident locations' })
  @Get('incidents')
  queryIncidents(
    @Query() dto: IncidentQueryDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.gisService.queryIncidents(dto, toCtx(user));
  }

  @ApiOperation({ summary: 'Get a single incident location by ID' })
  @Get('incidents/:id')
  getIncident(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.gisService.getIncidentAsGeoJson(id, toCtx(user));
  }

  @ApiOperation({ summary: 'Mark an incident as resolved' })
  @Patch('incidents/:id/resolve')
  resolveIncident(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.gisService.resolveIncident(id, toCtx(user));
  }

  // ── Administrative Boundaries ─────────────────────────────────────────────

  @ApiOperation({ summary: 'Ingest an administrative boundary (single or batch init)' })
  @Post('boundaries')
  ingestBoundary(
    @Body() dto: IngestBoundaryDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.gisService.ingestBoundary(dto, toCtx(user));
  }

  @ApiOperation({ summary: 'Get administrative hierarchy chain for a boundary code' })
  @Get('boundaries/:code/hierarchy')
  getBoundaryHierarchy(@Param('code') code: string) {
    return this.gisService.getBoundaryHierarchy(code);
  }

  @ApiOperation({ summary: 'Spatially enrich a point: resolve administrative region' })
  @Get('enrich/point')
  enrichPoint(
    @Query('lon') lon: string,
    @Query('lat') lat: string,
  ) {
    return this.gisService.spatialEnrichPoint(parseFloat(lon), parseFloat(lat));
  }

  // ── Analytics ─────────────────────────────────────────────────────────────

  @ApiOperation({ summary: 'Get incident summary aggregated by administrative region' })
  @Get('analytics/incident-summary')
  getIncidentSummary(
    @Query('hazardClass') hazardClass?: string,
  ) {
    return this.gisService.getIncidentSummaryByRegion(undefined, hazardClass);
  }

  @ApiOperation({ summary: 'Refresh incident summary materialized view (admin action)' })
  @Post('analytics/refresh-summary')
  @HttpCode(HttpStatus.NO_CONTENT)
  async refreshSummary(@CurrentUser() user: JwtPayload) {
    await this.gisService.refreshIncidentSummary();
  }
}
