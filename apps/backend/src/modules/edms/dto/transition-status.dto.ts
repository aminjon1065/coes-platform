import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { DocumentStatus } from '../entities/document.entity';

export class TransitionStatusDto {
  @IsEnum(DocumentStatus)
  targetStatus: DocumentStatus;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
