import { ConfigService } from '@nestjs/config';
import { TelegramNotificationProvider } from './telegram-notification.provider';

describe('TelegramNotificationProvider', () => {
  const fetchMock = jest.fn();
  const originalFetch = global.fetch;

  beforeAll(() => {
    (global as any).fetch = fetchMock;
  });

  afterAll(() => {
    (global as any).fetch = originalFetch;
  });

  beforeEach(() => {
    fetchMock.mockReset();
  });

  function makeConfig(
    overrides: Record<string, unknown> = {},
  ): ConfigService {
    const values: Record<string, unknown> = {
      'telegram.enabled': true,
      'telegram.botToken': 'bot-token',
      'telegram.apiBaseUrl': 'https://api.telegram.org',
      'telegram.timeoutMs': 10000,
      'telegram.disableLinkPreview': true,
      ...overrides,
    };

    return {
      get: jest.fn((key: string, defaultValue?: unknown) =>
        Object.prototype.hasOwnProperty.call(values, key) ? values[key] : defaultValue,
      ),
    } as unknown as ConfigService;
  }

  it('returns success when Telegram API accepts the message', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      text: jest.fn().mockResolvedValue(
        JSON.stringify({ ok: true, result: { message_id: 42 } }),
      ),
    });

    const provider = new TelegramNotificationProvider(makeConfig());
    await expect(
      provider.send({ chatId: '123456', text: 'Critical incident update' }),
    ).resolves.toEqual({
      success: true,
      messageId: '42',
    });
  });

  it('marks 403 chat failures as invalid subscriptions', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 403,
      text: jest.fn().mockResolvedValue(
        JSON.stringify({ ok: false, description: 'bot was blocked by the user' }),
      ),
    });

    const provider = new TelegramNotificationProvider(makeConfig());
    await expect(
      provider.send({ chatId: '123456', text: 'Critical incident update' }),
    ).resolves.toEqual(
      expect.objectContaining({
        success: false,
        invalid: true,
      }),
    );
  });

  it('throws when Telegram delivery is disabled', async () => {
    const provider = new TelegramNotificationProvider(
      makeConfig({ 'telegram.enabled': false }),
    );

    await expect(
      provider.send({ chatId: '123456', text: 'Critical incident update' }),
    ).rejects.toThrow('Telegram notification delivery is disabled');
  });
});
