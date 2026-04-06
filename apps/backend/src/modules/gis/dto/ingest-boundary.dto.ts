import {
  IsString,
  IsEnum,
  IsOptional,
  IsInt,
  IsObject,
  Min,
  MaxLength,
} from 'class-validator';
import { AdminLevel } from '../entities/administrative-boundary.entity';

export class IngestBoundaryDto {
  @IsString()
  @MaxLength(20)
  code: string;

  @IsString()
  @MaxLength(200)
  nameLocal: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  nameRu?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  nameEn?: string;

  @IsEnum(AdminLevel)
  adminLevel: AdminLevel;

  @IsOptional()
  @IsString()
  parentCode?: string;

  /**
   * GeoJSON MultiPolygon geometry.
   * Example: { "type": "MultiPolygon", "coordinates": [[[[lon, lat], ...]]] }
   */
  @IsObject()
  geometry: object;

  @IsOptional()
  @IsInt()
  @Min(0)
  population?: number;

  @IsOptional()
  @IsObject()
  metadata?: object;
}
