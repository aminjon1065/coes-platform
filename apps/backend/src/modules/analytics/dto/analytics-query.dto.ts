import { IsOptional, IsString, IsInt, IsEnum, IsBoolean, Min, Max } from 'class-validator';
import { Type, Transform } from 'class-transformer';
import { IncidentStatus, IncidentSeverity } from '../entities/incident.entity';

export class ListIncidentsDto {
  @IsOptional()
  @IsEnum(IncidentStatus)
  status?: IncidentStatus;

  @IsOptional()
  @IsEnum(IncidentSeverity)
  severity?: IncidentSeverity;

  @IsOptional()
  @IsString()
  incidentType?: string;

  @IsOptional()
  @IsString()
  administrativeCode?: string;

  @IsOptional()
  @IsString()
  from?: string;

  @IsOptional()
  @IsString()
  to?: string;

  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  openOnly?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number;
}

/** Query parameters for aggregated statistics */
export class StatsQueryDto {
  @IsOptional()
  @IsString()
  incidentType?: string;

  @IsOptional()
  @IsString()
  administrativeCode?: string;

  @IsOptional()
  @IsString()
  from?: string;

  @IsOptional()
  @IsString()
  to?: string;

  /** 'daily' | 'weekly' | 'monthly' | 'yearly' */
  @IsOptional()
  @IsString()
  groupBy?: string;
}

/** Request a report to be generated */
export class GenerateReportDto {
  @IsString()
  reportType: string;

  @IsOptional()
  @IsString()
  from?: string;

  @IsOptional()
  @IsString()
  to?: string;

  @IsOptional()
  @IsString()
  incidentType?: string;

  @IsOptional()
  @IsString()
  administrativeCode?: string;

  @IsOptional()
  @IsEnum({ JSON: 'json', CSV: 'csv', PDF: 'pdf', XLSX: 'xlsx' })
  format?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(3)
  classification?: number;
}
