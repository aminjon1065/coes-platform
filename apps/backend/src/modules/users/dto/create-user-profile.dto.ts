import {
  IsString,
  IsEmail,
  IsOptional,
  MinLength,
  MaxLength,
  IsUUID,
  IsInt,
  Min,
  Max,
  Matches,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateUserProfileDto {
  @ApiProperty({ description: 'UUID of the IAM credential this profile belongs to' })
  @IsUUID()
  credentialId: string;

  @ApiProperty({ example: 'Дусханбеков' })
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  firstName: string;

  @ApiProperty({ example: 'Алишер' })
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  lastName: string;

  @ApiPropertyOptional({ example: 'Рустамович' })
  @IsString()
  @IsOptional()
  @MaxLength(100)
  middleName?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  @MaxLength(255)
  displayName?: string;

  @ApiProperty({ example: 'a.dushanbekov@coescd.tj' })
  @IsEmail()
  @MaxLength(255)
  email: string;

  @ApiPropertyOptional({ example: '+992 900 000000' })
  @IsString()
  @IsOptional()
  @MaxLength(30)
  phone?: string;

  @ApiPropertyOptional({ description: 'Clearance level: 0=public 1=internal 2=confidential 3=secret', minimum: 0, maximum: 3 })
  @IsInt()
  @Min(0)
  @Max(3)
  @IsOptional()
  clearanceLevel?: number;
}
