import { IsUUID, IsString, IsOptional, IsInt, Min, Max, MaxLength } from 'class-validator';

export class AddAttachmentDto {
  @IsUUID()
  fileId: string;

  @IsString()
  @MaxLength(500)
  fileName: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  mimeType?: string;

  @IsOptional()
  @IsInt()
  fileSizeBytes?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(3)
  classification?: number;
}
