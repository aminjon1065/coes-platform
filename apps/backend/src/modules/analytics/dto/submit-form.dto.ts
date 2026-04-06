import {
  IsString,
  IsOptional,
  IsNumber,
  IsObject,
  IsUUID,
  MaxLength,
} from 'class-validator';

export class SubmitFormDto {
  @IsOptional()
  @IsUUID()
  incidentId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  incidentRef?: string;

  /** Field values keyed by field name */
  @IsObject()
  data: object;

  @IsOptional()
  @IsNumber()
  locationLat?: number;

  @IsOptional()
  @IsNumber()
  locationLon?: number;
}
