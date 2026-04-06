import {
  IsString,
  IsEnum,
  IsOptional,
  IsInt,
  IsArray,
  IsObject,
  Min,
  Max,
  MinLength,
  MaxLength,
  IsUrl,
} from 'class-validator';
import { GeometryType, UpdateCadence } from '../entities/spatial-layer.entity';

export class CreateSpatialLayerDto {
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsEnum(GeometryType)
  geometryType: GeometryType;

  @IsOptional()
  @IsInt()
  srid?: number;

  @IsInt()
  @Min(0)
  @Max(3)
  classification: number;

  @IsString()
  ownerPositionId: string;

  @IsOptional()
  @IsEnum(UpdateCadence)
  updateCadence?: UpdateCadence;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  sourceName?: string;

  @IsOptional()
  @IsUrl()
  sourceUrl?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  keywords?: string[];

  @IsOptional()
  @IsObject()
  schemaDefinition?: object;

  @IsOptional()
  @IsObject()
  symbology?: object;

  @IsOptional()
  @IsInt()
  @Min(1)
  retentionDays?: number;
}
