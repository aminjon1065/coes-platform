import {
  IsString,
  IsEmail,
  MinLength,
  MaxLength,
  Matches,
  IsBoolean,
  IsOptional,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class RegisterDto {
  @ApiProperty({ example: 'j.dushanbekov' })
  @IsString()
  @MinLength(3)
  @MaxLength(100)
  @Matches(/^[a-z0-9._-]+$/, {
    message: 'Username may only contain lowercase letters, digits, dot, underscore or hyphen',
  })
  username: string;

  @ApiProperty({ example: 'j.dushanbekov@coescd.tj' })
  @IsEmail()
  @MaxLength(255)
  email: string;

  @ApiProperty({ minLength: 12 })
  @IsString()
  @MinLength(12)
  @MaxLength(128)
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&_\-#])/, {
    message:
      'Password must contain uppercase, lowercase, digit, and special character',
  })
  password: string;

  @ApiProperty({ required: false })
  @IsBoolean()
  @IsOptional()
  isServiceAccount?: boolean;
}
