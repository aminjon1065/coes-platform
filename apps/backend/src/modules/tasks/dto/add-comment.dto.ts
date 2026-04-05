import { IsString, IsOptional, IsBoolean } from 'class-validator';

export class AddCommentDto {
  @IsString()
  body: string;

  @IsOptional()
  @IsBoolean()
  isInternal?: boolean;
}
