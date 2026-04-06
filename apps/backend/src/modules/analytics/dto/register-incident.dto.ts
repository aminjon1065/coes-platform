import {
  IsString,
  IsEnum,
  IsOptional,
  IsInt,
  IsNumber,
  IsObject,
  IsArray,
  IsDateString,
  IsUUID,
  Min,
  Max,
  MaxLength,
  MinLength,
} from 'class-validator';
import { IncidentSeverity } from '../entities/incident.entity';

export class RegisterIncidentDto {
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  incidentRef: string;

  @IsString()
  @MinLength(2)
  @MaxLength(300)
  title: string;

  @IsString()
  @MaxLength(100)
  incidentType: string;

  @IsOptional()
  @IsEnum(IncidentSeverity)
  severity?: IncidentSeverity;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  administrativeCode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  administrativeName?: string;

  @IsOptional()
  @IsNumber()
  latitude?: number;

  @IsOptional()
  @IsNumber()
  longitude?: number;

  @IsOptional()
  @IsNumber()
  affectedAreaKm2?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  affectedPopulation?: number;

  @IsOptional()
  @IsObject()
  attributes?: object;

  @IsInt()
  @Min(0)
  @Max(3)
  classification: number;

  @IsOptional()
  @IsUUID()
  responsibleDeptId?: string;

  @IsOptional()
  @IsDateString()
  reportedAt?: string;
}
