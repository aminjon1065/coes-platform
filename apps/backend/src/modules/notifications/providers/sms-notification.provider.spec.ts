import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';

import { SmsNotificationProvider } from './sms-notification.provider';
import { UserProfile, UserStatus } from '../../users/entities/user-profile.entity';
import { CredentialStatus, UserCredential } from '../../iam/entities/user-credential.entity';

describe('SmsNotificationProvider', () => {
  let provider: SmsNotificationProvider;
  let profileRepo: jest.Mocked<Repository<UserProfile>>;
  let credentialRepo: jest.Mocked<Repository<UserCredential>>;
  let config: jest.Mocked<ConfigService>;
  let originalFetch: typeof fetch | undefined;

  beforeEach(() => {
    originalFetch = global.fetch;

    profileRepo = {
      findOne: jest.fn(),
    } as unknown as jest.Mocked<Repository<UserProfile>>;

    credentialRepo = {
      findOne: jest.fn(),
    } as unknown as jest.Mocked<Repository<UserCredential>>;

    config = {
      get: jest.fn((key: string, defaultValue?: unknown) => {
        const values: Record<string, unknown> = {
          'sms.enabled': true,
          'sms.providerUrl': 'https://sms.internal/send',
          'sms.providerToken': 'token-1',
          'sms.authHeader': 'Authorization',
          'sms.tokenPrefix': 'Bearer ',
          'sms.sender': 'COESCD',
          'sms.timeoutMs': 10000,
          'sms.defaultCountryCode': '992',
        };
        return key in values ? values[key] : defaultValue;
      }),
    } as unknown as jest.Mocked<ConfigService>;

    provider = new SmsNotificationProvider(profileRepo, credentialRepo, config);
  });

  afterEach(() => {
    global.fetch = originalFetch as typeof fetch;
  });

  it('posts to the configured SMS gateway and returns message id', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      text: jest.fn().mockResolvedValue(JSON.stringify({ messageId: 'sms-1' })),
    }) as unknown as typeof fetch;

    await expect(
      provider.send({ to: '+992501234567', body: 'Critical alert' }),
    ).resolves.toEqual({ success: true, messageId: 'sms-1' });

    expect(global.fetch).toHaveBeenCalledWith(
      'https://sms.internal/send',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ Authorization: 'Bearer token-1' }),
      }),
    );
  });

  it('returns failed result when gateway responds with non-2xx', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 503,
      text: jest.fn().mockResolvedValue('gateway unavailable'),
    }) as unknown as typeof fetch;

    await expect(
      provider.send({ to: '+992501234567', body: 'Critical alert' }),
    ).resolves.toEqual({
      success: false,
      error: 'SMS gateway 503: gateway unavailable',
    });
  });

  it('resolves and normalizes phone number from user profile', async () => {
    credentialRepo.findOne.mockResolvedValue({
      id: 'cred-1',
      status: CredentialStatus.ACTIVE,
      isServiceAccount: false,
    } as UserCredential);
    profileRepo.findOne.mockResolvedValue({
      credentialId: 'cred-1',
      phone: '50 123 45 67',
      status: UserStatus.ACTIVE,
    } as UserProfile);

    await expect(provider.resolvePhoneNumber('cred-1')).resolves.toBe('+992501234567');
  });

  it('returns null when user has no active mobile contact', async () => {
    credentialRepo.findOne.mockResolvedValue({
      id: 'cred-1',
      status: CredentialStatus.ACTIVE,
      isServiceAccount: false,
    } as UserCredential);
    profileRepo.findOne.mockResolvedValue({
      credentialId: 'cred-1',
      phone: null,
      status: UserStatus.ACTIVE,
    } as UserProfile);

    await expect(provider.resolvePhoneNumber('cred-1')).resolves.toBeNull();
  });
});
