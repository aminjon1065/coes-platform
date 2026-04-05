import { IsEnum, IsBoolean, IsOptional, IsString, Matches } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { AppLanguage } from '../entities/user-preferences.entity';

export class UpdatePreferencesDto {
  @ApiPropertyOptional({ enum: AppLanguage })
  @IsEnum(AppLanguage)
  @IsOptional()
  language?: AppLanguage;

  @ApiPropertyOptional()
  @IsBoolean()
  @IsOptional()
  notifyEmail?: boolean;

  @ApiPropertyOptional()
  @IsBoolean()
  @IsOptional()
  notifySms?: boolean;

  @ApiPropertyOptional()
  @IsBoolean()
  @IsOptional()
  notifyInApp?: boolean;

  @ApiPropertyOptional({ example: '22:00', description: 'HH:MM quiet hours start' })
  @IsString()
  @IsOptional()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, { message: 'Must be HH:MM format' })
  quietHoursStart?: string;

  @ApiPropertyOptional({ example: '07:00', description: 'HH:MM quiet hours end' })
  @IsString()
  @IsOptional()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, { message: 'Must be HH:MM format' })
  quietHoursEnd?: string;
}
