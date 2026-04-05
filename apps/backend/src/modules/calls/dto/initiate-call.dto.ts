import { IsUUID, IsOptional, IsString, IsInt, Min, Max, IsDateString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class InitiateCallDto {
  @ApiProperty({ description: 'Chat channel ID for the call' })
  @IsUUID()
  channelId: string;

  @ApiPropertyOptional({ description: 'Optional call title' })
  @IsOptional()
  @IsString()
  title?: string;

  @ApiPropertyOptional({ description: 'Classification level 0–3', minimum: 0, maximum: 3 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(3)
  classification?: number;

  @ApiPropertyOptional({ description: 'Maximum participants allowed' })
  @IsOptional()
  @IsInt()
  @Min(2)
  @Max(200)
  maxParticipants?: number;
}

export class ScheduleCallDto {
  @ApiProperty()
  @IsString()
  title: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  channelId?: string;

  @ApiProperty()
  @IsDateString()
  scheduledStart: string;

  @ApiProperty()
  @IsDateString()
  scheduledEnd: string;

  @ApiPropertyOptional({ minimum: 0, maximum: 3 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(3)
  classification?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(2)
  @Max(200)
  maxParticipants?: number;
}
