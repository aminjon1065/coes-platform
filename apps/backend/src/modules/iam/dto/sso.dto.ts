import { IsString, IsNotEmpty, IsOptional, MaxLength } from 'class-validator';

export class LdapLoginDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  username: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  password: string;

  /** Optional: selects which LDAP configuration to use when multiple are configured */
  @IsString()
  @IsOptional()
  @MaxLength(100)
  domain?: string;
}

export class SamlCallbackDto {
  @IsString()
  @IsNotEmpty()
  SAMLResponse: string;

  @IsString()
  @IsOptional()
  RelayState?: string;
}
