import { IsOptional, IsString, IsUUID, IsInt, Min, Max, MaxLength } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UploadFileDto {
  @ApiPropertyOptional({ description: 'Human-readable name for the file. Defaults to the original filename.' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  displayName?: string;

  @ApiPropertyOptional({ description: 'Folder to place the file in.' })
  @IsOptional()
  @IsUUID()
  folderId?: string;

  /** 0=unrestricted 1=internal 2=confidential 3=secret */
  @ApiPropertyOptional({ description: 'Classification level (0–3). Defaults to 1 (internal).' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(3)
  classification?: number;

  @ApiPropertyOptional({ description: 'Optional note describing this upload.' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  uploadNote?: string;
}
