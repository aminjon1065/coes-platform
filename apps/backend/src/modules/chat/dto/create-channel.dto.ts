import {
  IsEnum, IsString, IsOptional, IsInt, Min, Max, IsBoolean,
  IsArray, IsUUID, MaxLength,
} from 'class-validator';
import { ChannelType } from '../entities/channel.entity';

export class CreateChannelDto {
  @IsOptional()
  @IsString()
  @MaxLength(300)
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsEnum(ChannelType)
  type: ChannelType;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(3)
  classification?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  retentionDays?: number;

  /** Initial member positions (UUIDs) */
  @IsOptional()
  @IsArray()
  @IsUUID(undefined, { each: true })
  memberPositionIds?: string[];
}
