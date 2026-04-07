import { ConfigService } from '@nestjs/config';
import * as webpush from 'web-push';
import { PushNotificationProvider } from './push-notification.provider';

jest.mock('web-push', () => ({
  sendNotification: jest.fn(),
  setVapidDetails: jest.fn(),
}));

describe('PushNotificationProvider', () => {
  let provider: PushNotificationProvider;
  let config: { get: jest.Mock };

  beforeEach(() => {
    config = {
      get: jest.fn((key: string, fallback?: unknown) => {
        const values: Record<string, unknown> = {
          'webpush.enabled': true,
          'webpush.subject': 'mailto:alerts@coescd.local',
          'webpush.vapidPublicKey': 'public-key',
          'webpush.vapidPrivateKey': 'private-key',
          'webpush.ttlSeconds': 300,
          'webpush.urgency': 'high',
        };
        return values[key] ?? fallback;
      }),
    };

    provider = new PushNotificationProvider(config as unknown as ConfigService);
    jest.clearAllMocks();
  });

  it('sends a notification via web-push with VAPID configuration', async () => {
    (webpush.sendNotification as jest.Mock).mockResolvedValue({ statusCode: 201 });

    const result = await provider.send(
      {
        endpoint: 'https://push.example.test/subscription/1',
        expirationTime: null,
        keys: { p256dh: 'p256dh', auth: 'auth' },
      },
      {
        title: 'Task overdue',
        body: 'Inspect bridge sector 4',
        actionUrl: '/tasks/task-1',
        data: { notificationId: 'notif-1' },
      },
    );

    expect(webpush.setVapidDetails).toHaveBeenCalledWith(
      'mailto:alerts@coescd.local',
      'public-key',
      'private-key',
    );
    expect(webpush.sendNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        endpoint: 'https://push.example.test/subscription/1',
      }),
      expect.any(String),
      expect.objectContaining({
        TTL: 300,
        urgency: 'high',
      }),
    );
    expect(result).toEqual({ success: true, statusCode: 201 });
  });

  it('maps expired upstream subscriptions to expired results', async () => {
    (webpush.sendNotification as jest.Mock).mockRejectedValue({
      statusCode: 410,
      body: 'Subscription expired',
    });

    const result = await provider.send(
      {
        endpoint: 'https://push.example.test/subscription/1',
        expirationTime: null,
        keys: { p256dh: 'p256dh', auth: 'auth' },
      },
      {
        title: 'Task overdue',
        body: 'Inspect bridge sector 4',
      },
    );

    expect(result).toEqual({
      success: false,
      statusCode: 410,
      expired: true,
      error: 'Subscription expired',
    });
  });
});
