import { IsNumber, IsOptional, IsString, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';

/** Query parameters for incident heatmap density data */
export class HeatmapQueryDto {
  /** Bounding box — western longitude */
  @Type(() => Number)
  @IsNumber()
  minLon: number;

  /** Bounding box — southern latitude */
  @Type(() => Number)
  @IsNumber()
  minLat: number;

  /** Bounding box — eastern longitude */
  @Type(() => Number)
  @IsNumber()
  maxLon: number;

  /** Bounding box — northern latitude */
  @Type(() => Number)
  @IsNumber()
  maxLat: number;

  /** ISO date — incidents reported on or after this date */
  @IsOptional()
  @IsString()
  from?: string;

  /** ISO date — incidents reported on or before this date */
  @IsOptional()
  @IsString()
  to?: string;

  /** Filter to a specific incident type */
  @IsOptional()
  @IsString()
  incidentType?: string;

  /**
   * Minimum severity to include (1–5 numeric mapping:
   * low=1, medium=2, high=3, critical=4).
   * Default: include all.
   */
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(4)
  minSeverity?: number;
}
