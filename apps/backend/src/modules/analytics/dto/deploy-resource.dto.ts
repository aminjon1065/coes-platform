import {
  IsString,
  IsEnum,
  IsOptional,
  IsInt,
  IsNumber,
  IsUUID,
  IsDateString,
  Min,
  MaxLength,
} from 'class-validator';
import { ResourceType } from '../entities/resource-deployment.entity';

export class DeployResourceDto {
  @IsEnum(ResourceType)
  resourceType: ResourceType;

  @IsString()
  @MaxLength(200)
  resourceName: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  quantity?: number;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  unit?: string;

  @IsOptional()
  @IsUUID()
  deptId?: string;

  @IsOptional()
  @IsDateString()
  deployedAt?: string;

  @IsOptional()
  @IsNumber()
  costEstimate?: number;

  @IsOptional()
  @IsString()
  notes?: string;
}
