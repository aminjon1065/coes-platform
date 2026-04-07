import { Type } from 'class-transformer';
import { IsArray, IsBoolean, IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';
import { SearchIndexName } from '../services/search-index.service';

export class ReindexSearchDto {
  @IsOptional()
  @IsArray()
  @IsEnum(SearchIndexName, { each: true })
  indices?: SearchIndexName[];

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(10)
  @Max(1000)
  batchSize?: number = 250;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  ensureIndices?: boolean = true;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  refresh?: boolean = true;
}
