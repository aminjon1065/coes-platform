import { IsString, Length, Matches } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class MfaTokenDto {
  @ApiProperty({ description: '6-digit TOTP code', example: '123456' })
  @IsString()
  @Length(6, 6)
  @Matches(/^\d{6}$/, { message: 'token must be exactly 6 digits' })
  token: string;
}

export class MfaBackupCodeDto {
  @ApiProperty({ description: 'Backup code in format XXXX-XXXX', example: 'A1B2-C3D4' })
  @IsString()
  @Length(9, 9)
  code: string;
}

export class MfaVerifyStepDto {
  @ApiProperty({ description: 'Short-lived MFA pending JWT' })
  @IsString()
  mfaToken: string;

  @ApiProperty({ description: '6-digit TOTP code' })
  @IsString()
  @Length(6, 6)
  @Matches(/^\d{6}$/, { message: 'token must be exactly 6 digits' })
  totpCode: string;
}

export class MfaVerifyBackupStepDto {
  @ApiProperty({ description: 'Short-lived MFA pending JWT' })
  @IsString()
  mfaToken: string;

  @ApiProperty({ description: 'Backup code in format XXXX-XXXX' })
  @IsString()
  @Length(9, 9)
  backupCode: string;
}
