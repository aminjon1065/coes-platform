import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { SpatialLayer } from './entities/spatial-layer.entity';
import { SpatialFeature } from './entities/spatial-feature.entity';
import { HazardZone } from './entities/hazard-zone.entity';
import { IncidentLocation } from './entities/incident-location.entity';
import { AdministrativeBoundary } from './entities/administrative-boundary.entity';

import { GisService } from './services/gis.service';
import { GisController } from './controllers/gis.controller';

import { AuditModule } from '../audit/audit.module';

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
  providers: [GisService],
  exports: [GisService],
})
export class GisModule {}
