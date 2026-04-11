import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { SpatialLayer } from './entities/spatial-layer.entity';
import { SpatialFeature } from './entities/spatial-feature.entity';
import { HazardZone } from './entities/hazard-zone.entity';
import { IncidentLocation } from './entities/incident-location.entity';
import { AdministrativeBoundary } from './entities/administrative-boundary.entity';

import { GisService } from './services/gis.service';
import { GisClusteringService } from './services/gis-clustering.service';
import { GisHeatmapService } from './services/gis-heatmap.service';
import { GisAnalyticsService } from './services/gis-analytics.service';
import { GisController } from './controllers/gis.controller';

import { AuditModule } from '../audit/audit.module';
import { GatewayEventsService } from '../../infra/events/gateway-events.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      SpatialLayer,
      SpatialFeature,
      HazardZone,
      IncidentLocation,
      AdministrativeBoundary,
    ]),
    AuditModule,
  ],
  controllers: [GisController],
  providers: [GisService, GisClusteringService, GisHeatmapService, GisAnalyticsService, GatewayEventsService],
  exports: [GisService, GisClusteringService, GisHeatmapService, GisAnalyticsService],
})
export class GisModule {}
