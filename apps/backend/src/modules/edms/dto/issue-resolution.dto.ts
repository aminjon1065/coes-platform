import {
  IsString,
  IsOptional,
  IsEnum,
  IsDateString,
  IsArray,
  ValidateNested,
  IsUUID,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ResolutionPriority } from '../entities/resolution.entity';
import { ExecutorRole } from '../entities/executor-assignment.entity';

export class ExecutorAssignmentDto {
  @IsUUID()
  positionId: string;

  @IsOptional()
  @IsEnum(ExecutorRole)
  role?: ExecutorRole;

  @IsOptional()
  @IsString()
  instruction?: string;

  @IsOptional()
  @IsDateString()
  deadline?: string;
}

export class IssueResolutionDto {
  @IsString()
  text: string;

  @IsOptional()
  @IsEnum(ResolutionPriority)
  priority?: ResolutionPriority;

  @IsOptional()
  @IsDateString()
  deadline?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ExecutorAssignmentDto)
  executors: ExecutorAssignmentDto[];

  /** Workflow step ID where the resolution is being issued (for linking) */
  @IsOptional()
  @IsUUID()
  workflowStepId?: string;
}
