import { registerAs } from '@nestjs/config';

export default registerAs('clamav', () => ({
  enabled: process.env.CLAMAV_ENABLED === 'true',
  host: process.env.CLAMAV_HOST ?? 'clamav',
  port: parseInt(process.env.CLAMAV_PORT ?? '3310', 10),
  timeoutMs: parseInt(process.env.CLAMAV_TIMEOUT_MS ?? '30000', 10),
  chunkSize: parseInt(process.env.CLAMAV_CHUNK_SIZE ?? '65536', 10),
}));
