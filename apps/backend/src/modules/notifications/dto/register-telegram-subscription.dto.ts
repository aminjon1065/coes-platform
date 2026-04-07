import { IsOptional, IsString, Matches, MaxLength } from 'class-validator';

export class RegisterTelegramSubscriptionDto {
  @IsString()
  @Matches(/^-?\d+$/, { message: 'chatId must be a valid Telegram chat id' })
  chatId: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  username?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  displayName?: string | null;
}
