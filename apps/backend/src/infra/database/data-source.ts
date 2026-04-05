import 'reflect-metadata';
import { DataSource } from 'typeorm';
import * as dotenv from 'dotenv';
import { join } from 'path';

dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env' });

export const AppDataSource = new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST ?? 'localhost',
  port: parseInt(process.env.DB_PORT ?? '5432', 10),
  username: process.env.DB_USER ?? 'coescd',
  password: process.env.DB_PASSWORD ?? 'coescd_dev',
  database: process.env.DB_NAME ?? 'coescd',
  synchronize: false,
  logging: true,
  entities: [join(__dirname, '../../**/*.entity{.ts,.js}')],
  migrations: [join(__dirname, 'migrations/**/*{.ts,.js}')],
});
