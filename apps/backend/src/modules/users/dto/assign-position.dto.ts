import {
  IsUUID,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  IsDateString,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AssignmentType } from '../entities/user-position-assignment.entity';

export class AssignPositionDto {
  @ApiProperty({ description: 'Position UUID to assign the user to' })
  @IsUUID()
  positionId: string;

  @ApiPropertyOptional({ enum: AssignmentType, default: AssignmentType.PRIMARY })
  @IsEnum(AssignmentType)
  @IsOptional()
  type?: AssignmentType;

  @ApiPropertyOptional({ description: 'When the assignment takes effect (ISO8601). Defaults to now.' })
  @IsDateString()
  @IsOptional()
  assignedAt?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  @MaxLength(500)
  notes?: string;
}
