import { registerAs } from '@nestjs/config';

export default registerAs('telegram', () => ({
  enabled: process.env.TELEGRAM_ENABLED === 'true',
  botToken: process.env.TELEGRAM_BOT_TOKEN ?? '',
  apiBaseUrl: process.env.TELEGRAM_API_BASE_URL ?? 'https://api.telegram.org',
  timeoutMs: parseInt(process.env.TELEGRAM_TIMEOUT_MS ?? '10000', 10),
  disableLinkPreview: process.env.TELEGRAM_DISABLE_LINK_PREVIEW !== 'false',
}));
