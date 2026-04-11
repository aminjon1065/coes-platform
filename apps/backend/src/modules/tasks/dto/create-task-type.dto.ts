import {
  IsString, IsOptional, MaxLength, IsInt, Min, Max,
  IsBoolean,
} from 'class-validator';

/** Create a new TaskType configuration (task_admin only). §17.1 */
export class CreateTaskTypeDto {
  @IsString()
  @MaxLength(100)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  nameRu?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  nameTg?: string;

  @IsOptional()
  @IsString()
  description?: string;

  /** 1=low 2=normal 3=high 4=critical */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(4)
  defaultPriority?: number;

  /** Default deadline in working days from assignment */
  @IsOptional()
  @IsInt()
  @Min(1)
  defaultDeadlineDays?: number;

  @IsOptional()
  @IsBoolean()
  requiresAcceptance?: boolean;

  @IsOptional()
  @IsBoolean()
  requiresVerification?: boolean;

  @IsOptional()
  @IsBoolean()
  supportsCoExecutors?: boolean;

  @IsOptional()
  @IsBoolean()
  supportsSubtasks?: boolean;

  @IsOptional()
  @IsBoolean()
  supportsDraft?: boolean;
}
