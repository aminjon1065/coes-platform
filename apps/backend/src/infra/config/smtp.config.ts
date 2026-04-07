import { registerAs } from '@nestjs/config';

export default registerAs('smtp', () => ({
  enabled: process.env.SMTP_ENABLED === 'true',
  host: process.env.SMTP_HOST ?? 'localhost',
  port: parseInt(process.env.SMTP_PORT ?? '587', 10),
  secure: process.env.SMTP_SECURE === 'true',
  username: process.env.SMTP_USERNAME ?? '',
  password: process.env.SMTP_PASSWORD ?? '',
  from: process.env.SMTP_FROM ?? 'no-reply@coescd.local',
  replyTo: process.env.SMTP_REPLY_TO ?? '',
  connectionTimeoutMs: parseInt(process.env.SMTP_TIMEOUT_MS ?? '10000', 10),
  requireTls: process.env.SMTP_REQUIRE_TLS === 'true',
  ignoreTls: process.env.SMTP_IGNORE_TLS === 'true',
}));
