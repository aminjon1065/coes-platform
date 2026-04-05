import { IsInt, Min, Max, IsOptional, IsString } from 'class-validator';

export class UpdateProgressDto {
  @IsInt()
  @Min(0)
  @Max(100)
  progressPercent: number;

  @IsOptional()
  @IsString()
  progressNote?: string;
}
