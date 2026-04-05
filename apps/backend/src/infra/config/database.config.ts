import { registerAs } from '@nestjs/config';

export default registerAs('database', () => ({
  host: process.env.DB_HOST ?? 'localhost',
  port: parseInt(process.env.DB_PORT ?? '5432', 10),
  username: process.env.DB_USER ?? 'coescd',
  password: process.env.DB_PASSWORD ?? 'coescd_dev',
  name: process.env.DB_NAME ?? 'coescd',
  ssl: process.env.DB_SSL === 'true',
}));
