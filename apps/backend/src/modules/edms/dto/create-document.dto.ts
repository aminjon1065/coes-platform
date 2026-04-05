import {
  IsString,
  IsUUID,
  IsEnum,
  IsOptional,
  IsInt,
  Min,
  Max,
  IsArray,
  ValidateNested,
  IsDateString,
  MaxLength,
} from 'class-validator';
import { Type } from 'class-transformer';
import { DocumentDirection } from '../entities/document.entity';

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

export class CreateDocumentDto {
  @IsUUID()
  typeId: string;

  @IsEnum(DocumentDirection)
  direction: DocumentDirection;

  @IsString()
  @MaxLength(500)
  subject: string;

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

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RecipientDto)
  recipients: RecipientDto[];

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
}
