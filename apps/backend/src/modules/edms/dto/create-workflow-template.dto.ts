import {
  IsUUID,
  IsString,
  IsOptional,
  IsArray,
  ValidateNested,
  IsEnum,
  IsBoolean,
  IsInt,
  Min,
  MaxLength,
} from 'class-validator';
import { Type } from 'class-transformer';
import { StepType } from '../entities/workflow-step-definition.entity';

export class StepDefinitionDto {
  @IsInt()
  @Min(1)
  stepOrder: number;

  @IsString()
  @MaxLength(200)
  stepName: string;

  @IsEnum(StepType)
  stepType: StepType;

  /** JSON resolver config, e.g. { type: "fixed_position", positionId: "uuid" } */
  targetResolver: Record<string, unknown>;

  @IsOptional()
  @IsBoolean()
  isParallel?: boolean;

  @IsOptional()
  @IsInt()
  @Min(1)
  parallelThreshold?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  timeoutHours?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  secondaryEscalationHours?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  returnToStep?: number;

  @IsOptional()
  condition?: Record<string, unknown>;

  @IsOptional()
  @IsBoolean()
  isOptional?: boolean;
}

export class CreateWorkflowTemplateDto {
  @IsString()
  @MaxLength(200)
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsUUID()
  documentTypeId: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => StepDefinitionDto)
  steps: StepDefinitionDto[];
}
