import {
  IsString,
  IsEnum,
  IsOptional,
  IsInt,
  IsNumber,
  IsObject,
  IsUUID,
  Min,
  MaxLength,
} from 'class-validator';
import { IncidentSeverity, IncidentStatus } from '../entities/incident.entity';

export class UpdateIncidentDto {
  @IsOptional()
  @IsEnum(IncidentSeverity)
  severity?: IncidentSeverity;

  @IsOptional()
  @IsEnum(IncidentStatus)
  status?: IncidentStatus;

  @IsOptional()
  @IsInt()
  @Min(0)
  affectedPopulation?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  casualtiesConfirmed?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  casualtiesSuspected?: number;

  @IsOptional()
  @IsNumber()
  affectedAreaKm2?: number;

  @IsOptional()
  @IsObject()
  infrastructureDamage?: object;

  @IsOptional()
  @IsObject()
  attributes?: object;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  internalNotes?: string;

  @IsOptional()
  @IsUUID()
  leadResponderId?: string;

  @IsOptional()
  @IsUUID()
  responsibleDeptId?: string;
}
