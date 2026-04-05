import { IsEnum, IsOptional, IsString, IsInt, Min, Max, MaxLength } from 'class-validator';
import { TaskStatus } from '../entities/task.entity';

export class TransitionTaskStatusDto {
  @IsEnum(TaskStatus)
  targetStatus: TaskStatus;

  /** Required for ON_HOLD, CANNOT_EXECUTE, CANCELLED, RETURNED */
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;

  /** Required for COMPLETED — description of what was accomplished */
  @IsOptional()
  @IsString()
  completionReport?: string;

  /** Required for IN_PROGRESS transitions — current progress percentage */
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  progressPercent?: number;

  @IsOptional()
  @IsString()
  progressNote?: string;
}
