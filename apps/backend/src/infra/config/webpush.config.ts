import { registerAs } from '@nestjs/config';

export default registerAs('webpush', () => ({
  enabled: process.env.WEB_PUSH_ENABLED === 'true',
  subject: process.env.WEB_PUSH_SUBJECT ?? 'mailto:alerts@coescd.local',
  vapidPublicKey: process.env.WEB_PUSH_VAPID_PUBLIC_KEY ?? '',
  vapidPrivateKey: process.env.WEB_PUSH_VAPID_PRIVATE_KEY ?? '',
  ttlSeconds: parseInt(process.env.WEB_PUSH_TTL_SECONDS ?? '300', 10),
  urgency: process.env.WEB_PUSH_URGENCY ?? 'high',
}));
