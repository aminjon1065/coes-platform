import { IsOptional, IsEnum, IsString, IsInt, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';
import { GeometryType, LayerStatus } from '../entities/spatial-layer.entity';

export class ListLayersDto {
  @IsOptional()
  @IsEnum(LayerStatus)
  status?: LayerStatus;

  @IsOptional()
  @IsEnum(GeometryType)
  geometryType?: GeometryType;

  @IsOptional()
  @IsString()
  keyword?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number;
}
