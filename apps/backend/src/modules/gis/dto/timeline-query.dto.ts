import { IsEnum, IsOptional, IsString } from 'class-validator';

export enum TimelineGranularity {
  HOUR = 'hour',
  DAY = 'day',
  WEEK = 'week',
  MONTH = 'month',
}

/** Query parameters for incident timeline aggregation */
export class TimelineQueryDto {
  /** Aggregation granularity */
  @IsOptional()
  @IsEnum(TimelineGranularity)
  granularity?: TimelineGranularity;

  /** ISO date — start of the time range */
  @IsOptional()
  @IsString()
  from?: string;

  /** ISO date — end of the time range */
  @IsOptional()
  @IsString()
  to?: string;

  /** Filter to a specific incident type */
  @IsOptional()
  @IsString()
  incidentType?: string;

  /** Filter to a specific administrative code (region) */
  @IsOptional()
  @IsString()
  administrativeCode?: string;
}
