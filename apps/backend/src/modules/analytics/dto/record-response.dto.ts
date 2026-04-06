import {
  IsString,
  IsEnum,
  IsOptional,
  IsArray,
  IsObject,
  IsDateString,
  MaxLength,
} from 'class-validator';
import { ResponseAction } from '../entities/incident-response.entity';

export class RecordResponseDto {
  @IsEnum(ResponseAction)
  action: ResponseAction;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  locationNote?: string;

  @IsOptional()
  @IsDateString()
  occurredAt?: string;

  @IsOptional()
  @IsArray()
  @IsObject({ each: true })
  resourcesUsed?: object[];

  @IsOptional()
  @IsString()
  @MaxLength(500)
  outcome?: string;
}
