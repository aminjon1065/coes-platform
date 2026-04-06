import {
  IsString,
  IsEnum,
  IsOptional,
  IsInt,
  IsNumber,
  IsObject,
  IsDateString,
  Min,
  Max,
  MaxLength,
} from 'class-validator';
import { HazardClass, HazardSeverity } from '../entities/hazard-zone.entity';

export class CreateHazardZoneDto {
  /** ID of an existing spatial feature that holds the geometry */
  @IsString()
  featureId: string;

  @IsEnum(HazardClass)
  hazardClass: HazardClass;

  @IsEnum(HazardSeverity)
  severity: HazardSeverity;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  probabilityPct?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  returnPeriodYears?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  affectedPopulation?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  areaHa?: number;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  administrativeCode?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsObject()
  metadata?: object;

  @IsOptional()
  @IsDateString()
  validFrom?: string;

  @IsOptional()
  @IsDateString()
  validTo?: string;

  @IsInt()
  @Min(0)
  @Max(3)
  classification: number;
}
