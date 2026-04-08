import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';

export class ModerateParticipantDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  audioMuted?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  videoMuted?: boolean;
}
