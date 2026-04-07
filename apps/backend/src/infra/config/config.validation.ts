import { plainToInstance } from 'class-transformer';
import {
  IsString,
  IsNumber,
  IsOptional,
  IsIn,
  MinLength,
  validateSync,
} from 'class-validator';

class EnvironmentVariables {
  @IsIn(['development', 'production', 'test'])
  @IsOptional()
  NODE_ENV: string = 'development';

  @IsNumber()
  @IsOptional()
  PORT: number = 4000;

  @IsString()
  DB_HOST: string;

  @IsNumber()
  @IsOptional()
  DB_PORT: number = 5432;

  @IsString()
  DB_USER: string;

  @IsString()
  DB_PASSWORD: string;

  @IsString()
  DB_NAME: string;

  @IsString()
  REDIS_HOST: string;

  @IsNumber()
  @IsOptional()
  REDIS_PORT: number = 6379;

  @IsString()
  @MinLength(32)
  JWT_ACCESS_SECRET: string;

  @IsString()
  @MinLength(32)
  JWT_REFRESH_SECRET: string;

  @IsString()
  @IsOptional()
  MINIO_ENDPOINT: string = 'localhost';

  @IsNumber()
  @IsOptional()
  MINIO_PORT: number = 9000;

  @IsString()
  @IsOptional()
  MINIO_ROOT_USER: string = 'minioadmin';

  @IsString()
  @IsOptional()
  MINIO_ROOT_PASSWORD: string = 'minioadmin';

  @IsString()
  @IsOptional()
  MINIO_BUCKET: string = 'coescd-files';

  @IsString()
  @IsOptional()
  OPENSEARCH_NODE: string = 'http://localhost:9200';

  @IsString()
  @IsOptional()
  OPENSEARCH_USERNAME: string;

  @IsString()
  @IsOptional()
  OPENSEARCH_PASSWORD: string;

  @IsString()
  @IsOptional()
  OPENSEARCH_INDEX_PREFIX: string = 'coescd';

  @IsIn(['true', 'false'])
  @IsOptional()
  CLAMAV_ENABLED: string = 'false';

  @IsString()
  @IsOptional()
  CLAMAV_HOST: string = 'clamav';

  @IsNumber()
  @IsOptional()
  CLAMAV_PORT: number = 3310;

  @IsNumber()
  @IsOptional()
  CLAMAV_TIMEOUT_MS: number = 30000;

  @IsNumber()
  @IsOptional()
  CLAMAV_CHUNK_SIZE: number = 65536;

  @IsIn(['true', 'false'])
  @IsOptional()
  SMTP_ENABLED: string = 'false';

  @IsString()
  @IsOptional()
  SMTP_HOST: string = 'localhost';

  @IsNumber()
  @IsOptional()
  SMTP_PORT: number = 587;

  @IsIn(['true', 'false'])
  @IsOptional()
  SMTP_SECURE: string = 'false';

  @IsString()
  @IsOptional()
  SMTP_USERNAME: string = '';

  @IsString()
  @IsOptional()
  SMTP_PASSWORD: string = '';

  @IsString()
  @IsOptional()
  SMTP_FROM: string = 'no-reply@coescd.local';

  @IsString()
  @IsOptional()
  SMTP_REPLY_TO: string = '';

  @IsNumber()
  @IsOptional()
  SMTP_TIMEOUT_MS: number = 10000;

  @IsIn(['true', 'false'])
  @IsOptional()
  SMTP_REQUIRE_TLS: string = 'false';

  @IsIn(['true', 'false'])
  @IsOptional()
  SMTP_IGNORE_TLS: string = 'false';

  @IsIn(['true', 'false'])
  @IsOptional()
  SMS_ENABLED: string = 'false';

  @IsString()
  @IsOptional()
  SMS_PROVIDER_URL: string = '';

  @IsString()
  @IsOptional()
  SMS_PROVIDER_TOKEN: string = '';

  @IsString()
  @IsOptional()
  SMS_PROVIDER_AUTH_HEADER: string = 'Authorization';

  @IsString()
  @IsOptional()
  SMS_PROVIDER_TOKEN_PREFIX: string = 'Bearer ';

  @IsString()
  @IsOptional()
  SMS_SENDER: string = '';

  @IsNumber()
  @IsOptional()
  SMS_TIMEOUT_MS: number = 10000;

  @IsString()
  @IsOptional()
  SMS_DEFAULT_COUNTRY_CODE: string = '';

  @IsIn(['true', 'false'])
  @IsOptional()
  TELEGRAM_ENABLED: string = 'false';

  @IsString()
  @IsOptional()
  TELEGRAM_BOT_TOKEN: string = '';

  @IsString()
  @IsOptional()
  TELEGRAM_API_BASE_URL: string = 'https://api.telegram.org';

  @IsNumber()
  @IsOptional()
  TELEGRAM_TIMEOUT_MS: number = 10000;

  @IsIn(['true', 'false'])
  @IsOptional()
  TELEGRAM_DISABLE_LINK_PREVIEW: string = 'true';

  @IsIn(['true', 'false'])
  @IsOptional()
  WEB_PUSH_ENABLED: string = 'false';

  @IsString()
  @IsOptional()
  WEB_PUSH_SUBJECT: string = 'mailto:alerts@coescd.local';

  @IsString()
  @IsOptional()
  WEB_PUSH_VAPID_PUBLIC_KEY: string = '';

  @IsString()
  @IsOptional()
  WEB_PUSH_VAPID_PRIVATE_KEY: string = '';

  @IsNumber()
  @IsOptional()
  WEB_PUSH_TTL_SECONDS: number = 300;

  @IsIn(['very-low', 'low', 'normal', 'high'])
  @IsOptional()
  WEB_PUSH_URGENCY: string = 'high';
}

export function validateConfig(config: Record<string, unknown>) {
  // Skip strict validation in test environment
  if (config['NODE_ENV'] === 'test') return config;

  const validated = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  });
  const errors = validateSync(validated, {
    skipMissingProperties: false,
  });

  if (errors.length > 0) {
    throw new Error(
      `Configuration validation failed:\n${errors
        .map((e) => Object.values(e.constraints ?? {}).join(', '))
        .join('\n')}`,
    );
  }
  return validated;
}
