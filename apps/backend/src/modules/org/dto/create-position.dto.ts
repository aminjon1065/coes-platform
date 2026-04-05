import {
  IsString,
  IsOptional,
  MinLength,
  MaxLength,
  IsUUID,
  IsEnum,
  IsBoolean,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PositionLevel } from '../entities/position.entity';

export class CreatePositionDto {
  @ApiProperty()
  @IsString()
  @MinLength(2)
  @MaxLength(255)
  title: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  @MaxLength(255)
  titleRu?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  @MaxLength(255)
  titleTg?: string;

  @ApiProperty({ enum: PositionLevel })
  @IsEnum(PositionLevel)
  level: PositionLevel;

  @ApiProperty()
  @IsUUID()
  departmentId: string;

  @ApiPropertyOptional({ description: 'Position UUID this reports to' })
  @IsUUID()
  @IsOptional()
  reportsToId?: string;

  @ApiPropertyOptional({ default: false })
  @IsBoolean()
  @IsOptional()
  canAssignTasks?: boolean;

  @ApiPropertyOptional({ default: false })
  @IsBoolean()
  @IsOptional()
  canApproveDocuments?: boolean;

  @ApiPropertyOptional({ default: false })
  @IsBoolean()
  @IsOptional()
  canIssueResolutions?: boolean;
}
