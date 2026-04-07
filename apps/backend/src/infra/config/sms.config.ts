import { registerAs } from '@nestjs/config';

export default registerAs('sms', () => ({
  enabled: process.env.SMS_ENABLED === 'true',
  providerUrl: process.env.SMS_PROVIDER_URL ?? '',
  providerToken: process.env.SMS_PROVIDER_TOKEN ?? '',
  authHeader: process.env.SMS_PROVIDER_AUTH_HEADER ?? 'Authorization',
  tokenPrefix: process.env.SMS_PROVIDER_TOKEN_PREFIX ?? 'Bearer ',
  sender: process.env.SMS_SENDER ?? '',
  timeoutMs: parseInt(process.env.SMS_TIMEOUT_MS ?? '10000', 10),
  defaultCountryCode: process.env.SMS_DEFAULT_COUNTRY_CODE ?? '',
}));
