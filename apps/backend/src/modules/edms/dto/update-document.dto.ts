import {
  IsString,
  IsUUID,
  IsOptional,
  IsInt,
  Min,
  Max,
  IsArray,
  ValidateNested,
  IsDateString,
  MaxLength,
  IsEnum,
} from 'class-validator';
import { Type } from 'class-transformer';

class RecipientDto {
  @IsOptional()
  @IsUUID()
  positionId?: string;

  @IsString()
  @MaxLength(300)
  name: string;

  @IsEnum(['internal', 'external'])
  type: 'internal' | 'external';
}

/** Only allowed while document is in DRAFT status */
export class UpdateDocumentDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  subject?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(3)
  classification?: number;

  @IsOptional()
  @IsUUID()
  senderPositionId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  senderName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  externalRefNumber?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RecipientDto)
  recipients?: RecipientDto[];

  @IsOptional()
  @IsString()
  body?: string;

  @IsOptional()
  @IsDateString()
  deadline?: string;

  @IsOptional()
  @IsUUID()
  relatedDocumentId?: string;

  @IsOptional()
  @IsDateString()
  documentDate?: string;

  /** Required when saving a new version after return-for-revision */
  @IsOptional()
  @IsString()
  @MaxLength(500)
  changeReason?: string;
}
