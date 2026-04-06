import {
  IsOptional,
  IsNumber,
  IsInt,
  IsString,
  IsEnum,
  Min,
  Max,
} from 'class-validator';
import { Type } from 'class-transformer';
import { HazardClass, HazardSeverity } from '../entities/hazard-zone.entity';

/** Query features within a bounding box */
export class BboxQueryDto {
  @Type(() => Number)
  @IsNumber()
  minLon: number;

  @Type(() => Number)
  @IsNumber()
  minLat: number;

  @Type(() => Number)
  @IsNumber()
  maxLon: number;

  @Type(() => Number)
  @IsNumber()
  maxLat: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  limit?: number;
}

/** Query features within a radius of a point */
export class RadiusQueryDto {
  @Type(() => Number)
  @IsNumber()
  lon: number;

  @Type(() => Number)
  @IsNumber()
  lat: number;

  /** Radius in metres */
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500_000)
  radiusMetres: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  limit?: number;
}

/** Query hazard zones with optional filters */
export class HazardZoneQueryDto {
  @IsOptional()
  @IsEnum(HazardClass)
  hazardClass?: HazardClass;

  @IsOptional()
  @IsEnum(HazardSeverity)
  severity?: HazardSeverity;

  @IsOptional()
  @IsString()
  administrativeCode?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  lon?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  lat?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500_000)
  radiusMetres?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;
}

/** Query incident locations */
export class IncidentQueryDto {
  @IsOptional()
  @IsString()
  incidentType?: string;

  @IsOptional()
  @IsString()
  severity?: string;

  @IsOptional()
  @IsString()
  administrativeCode?: string;

  /** ISO date string — incidents reported on or after */
  @IsOptional()
  @IsString()
  from?: string;

  /** ISO date string — incidents reported on or before */
  @IsOptional()
  @IsString()
  to?: string;

  /** If true, only return open (unresolved) incidents */
  @IsOptional()
  openOnly?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  limit?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number;
}
