import {
  IsUUID,
  IsString,
  IsEnum,
  IsOptional,
  IsInt,
  Min,
  Max,
  MaxLength,
  IsDateString,
  IsArray,
  ArrayNotEmpty,
} from 'class-validator';
import { TaskPriority, TaskSource } from '../entities/task.entity';

export class CoExecutorDto {
  @IsUUID()
  positionId: string;

  @IsOptional()
  @IsDateString()
  deadline?: string;
}

export class CreateTaskDto {
  @IsUUID()
  typeId: string;

  @IsString()
  @MaxLength(500)
  title: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsUUID()
  responsiblePositionId: string;

  @IsOptional()
  @IsEnum(TaskPriority)
  priority?: TaskPriority;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(3)
  classification?: number;

  @IsOptional()
  @IsDateString()
  deadline?: string;

  /** Co-executors to assign alongside the primary responsible position */
  @IsOptional()
  @IsArray()
  coExecutors?: CoExecutorDto[];

  /** If creating a subtask, the parent task id */
  @IsOptional()
  @IsUUID()
  parentTaskId?: string;

  /** EDMS integration: originating document */
  @IsOptional()
  @IsUUID()
  sourceDocumentId?: string;

  @IsOptional()
  @IsUUID()
  sourceResolutionId?: string;

  /** System-generated tasks may specify source */
  @IsOptional()
  @IsEnum(TaskSource)
  source?: TaskSource;
}
