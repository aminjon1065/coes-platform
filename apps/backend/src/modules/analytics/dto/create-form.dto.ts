import {
  IsString,
  IsOptional,
  IsInt,
  IsArray,
  IsObject,
  Min,
  Max,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateFormDto {
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  incidentType?: string;

  /**
   * Array of field definition objects.
   * Each: { name: string, type: string, label: string, required: boolean, options?: string[] }
   */
  @IsArray()
  @IsObject({ each: true })
  fields: object[];

  @IsInt()
  @Min(0)
  @Max(3)
  classification: number;
}
