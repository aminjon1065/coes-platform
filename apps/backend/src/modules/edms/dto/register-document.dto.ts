import { IsOptional, IsUUID, IsDateString } from 'class-validator';

export class RegisterDocumentDto {
  @IsOptional()
  @IsUUID()
  registrarPositionId?: string;

  @IsOptional()
  @IsDateString()
  documentDate?: string;
}
