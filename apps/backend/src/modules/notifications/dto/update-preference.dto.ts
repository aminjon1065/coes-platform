import {
  IsOptional,
  IsBoolean,
  IsEnum,
  IsInt,
  Min,
  Max,
  IsString,
} from 'class-validator';
import { NotificationPriority } from '../entities/notification.entity';

export class UpdatePreferenceDto {
  /** Null / omit = update default preference */
  @IsOptional()
  @IsString()
  notificationType?: string;

  @IsOptional()
  @IsBoolean()
  inApp?: boolean;

  @IsOptional()
  @IsBoolean()
  email?: boolean;

  @IsOptional()
  @IsBoolean()
  sms?: boolean;

  @IsOptional()
  @IsBoolean()
  telegram?: boolean;

  @IsOptional()
  @IsBoolean()
  push?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1440) // max 24 hours throttle
  emailThrottleMinutes?: number;

  @IsOptional()
  @IsEnum(NotificationPriority)
  smsMinPriority?: NotificationPriority;

  @IsOptional()
  @IsEnum(NotificationPriority)
  telegramMinPriority?: NotificationPriority;
}
