import { IsString, IsOptional, IsArray, IsEnum, IsInt, Min, Max, IsIn } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { SearchIndexName } from '../services/search-index.service';

export class SearchQueryDto {
  @ApiProperty({ description: 'Full-text search query' })
  @IsString()
  q: string;

  @ApiPropertyOptional({
    description: 'Restrict search to specific indices. Defaults to all.',
    enum: SearchIndexName,
    isArray: true,
  })
  @IsOptional()
  @IsArray()
  @IsEnum(SearchIndexName, { each: true })
  indices?: SearchIndexName[];

  @ApiPropertyOptional({ default: 10 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number = 10;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number = 0;
}
