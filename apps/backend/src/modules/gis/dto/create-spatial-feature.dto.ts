import {
  IsString,
  IsOptional,
  IsInt,
  IsObject,
  IsDateString,
  Min,
  Max,
  MaxLength,
} from 'class-validator';

export class CreateSpatialFeatureDto {
  @IsString()
  layerId: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  externalId?: string;

  @IsOptional()
  @IsObject()
  properties?: object;

  @IsInt()
  @Min(0)
  @Max(3)
  classification: number;

  /**
   * GeoJSON geometry object.
   * Example: { "type": "Point", "coordinates": [69.2401, 38.5598] }
   */
  @IsObject()
  geometry: object;

  @IsOptional()
  @IsDateString()
  validFrom?: string;

  @IsOptional()
  @IsDateString()
  validTo?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  sourceRef?: string;
}
