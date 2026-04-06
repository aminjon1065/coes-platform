import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { join } from 'path';

// dotenv is loaded here so the TypeORM CLI can read .env.local when invoked
// directly (outside NestJS bootstrap). Safe to call multiple times.
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const dotenv = require('dotenv');
  dotenv.config({ path: join(process.cwd(), '.env.local') });
  dotenv.config({ path: join(process.cwd(), '.env') });
} catch {
  // dotenv not available — env vars must be set externally (Docker / CI)
}

// process.cwd() == apps/backend when migration commands are run from that dir.
// This works in both CommonJS (__dirname) and ESM (bun's default TS loader).
const src = join(process.cwd(), 'src');

export const AppDataSource = new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST ?? 'localhost',
  port: parseInt(process.env.DB_PORT ?? '5432', 10),
  username: process.env.DB_USER ?? 'coescd',
  password: process.env.DB_PASSWORD ?? 'coescd_dev',
  database: process.env.DB_NAME ?? 'coescd',
  synchronize: false,
  logging: true,
  entities: [join(src, '**/*.entity{.ts,.js}')],
  migrations: [join(src, 'infra/database/migrations/**/*{.ts,.js}')],
});
