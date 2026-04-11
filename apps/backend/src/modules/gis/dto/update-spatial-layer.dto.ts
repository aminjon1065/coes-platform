import {
  IsString,
  IsEnum,
  IsOptional,
  IsInt,
  IsArray,
  IsObject,
  Min,
  Max,
  MaxLength,
  IsUrl,
} from 'class-validator';
import { UpdateCadence } from '../entities/spatial-layer.entity';

export class UpdateSpatialLayerDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(3)
  classification?: number;

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
