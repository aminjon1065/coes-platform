import {
  IsString,
  IsOptional,
  IsInt,
  IsObject,
  IsNumber,
  IsDateString,
  Min,
  Max,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateIncidentLocationDto {
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  incidentRef: string;

  @IsString()
  @MinLength(2)
  @MaxLength(300)
  title: string;

  @IsString()
  @MaxLength(100)
  incidentType: string;

  @IsOptional()
  @IsString()
  severity?: string;

  /**
   * GeoJSON Point geometry.
   * Example: { "type": "Point", "coordinates": [69.2401, 38.5598] }
   */
  @IsObject()
  location: object;

  /**
   * Optional affected area — GeoJSON Polygon or MultiPolygon.
   */
  @IsOptional()
  @IsObject()
  affectedArea?: object;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  administrativeCode?: string;

  @IsOptional()
  @IsObject()
  attributes?: object;

  @IsInt()
  @Min(0)
  @Max(3)
  classification: number;

  @IsOptional()
  @IsDateString()
  reportedAt?: string;
}
