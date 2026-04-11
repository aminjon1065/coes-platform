import { IsNumber, IsOptional, IsString, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';

/** Query parameters for spatial incident clustering */
export class ClusterQueryDto {
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

  /**
   * Map zoom level — used to derive the cluster grid resolution.
   * Low zoom → large grid cells (few clusters), high zoom → small cells (more clusters).
   */
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(20)
  zoom: number;

  /** Filter to a specific incident type (optional) */
  @IsOptional()
  @IsString()
  incidentType?: string;

  /** If "true", exclude resolved incidents */
  @IsOptional()
  @IsString()
  openOnly?: string;
}
