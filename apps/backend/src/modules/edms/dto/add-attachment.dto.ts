import {
  IsUUID,
  IsString,
  IsEnum,
  IsOptional,
  IsInt,
  Min,
  Max,
  MaxLength,
} from 'class-validator';
import { AttachmentRole } from '../entities/document-attachment.entity';

export class AddAttachmentDto {
  @IsUUID()
  fileId: string;

  @IsString()
  @MaxLength(255)
  filename: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  mimeType?: string;

  @IsOptional()
  @IsInt()
  fileSizeBytes?: number;

  @IsEnum(AttachmentRole)
  role: AttachmentRole;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(3)
  classification?: number;
}
