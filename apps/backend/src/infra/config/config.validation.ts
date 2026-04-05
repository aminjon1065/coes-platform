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
