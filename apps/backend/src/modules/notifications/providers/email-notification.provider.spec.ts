import { Repository } from 'typeorm';
import * as nodemailer from 'nodemailer';
import { ConfigService } from '@nestjs/config';

import { EmailNotificationProvider } from './email-notification.provider';
import { UserProfile, UserStatus } from '../../users/entities/user-profile.entity';
import { CredentialStatus, UserCredential } from '../../iam/entities/user-credential.entity';

jest.mock('nodemailer', () => ({
  createTransport: jest.fn(),
}));

describe('EmailNotificationProvider', () => {
  let provider: EmailNotificationProvider;
  let profileRepo: jest.Mocked<Repository<UserProfile>>;
  let credentialRepo: jest.Mocked<Repository<UserCredential>>;
  let config: jest.Mocked<ConfigService>;

  beforeEach(() => {
    profileRepo = {
      findOne: jest.fn(),
    } as unknown as jest.Mocked<Repository<UserProfile>>;

    credentialRepo = {
      findOne: jest.fn(),
    } as unknown as jest.Mocked<Repository<UserCredential>>;

    config = {
      get: jest.fn((key: string, defaultValue?: unknown) => {
        const values: Record<string, unknown> = {
          'smtp.enabled': true,
          'smtp.host': 'smtp.internal',
          'smtp.port': 587,
          'smtp.secure': false,
          'smtp.username': 'mailer',
          'smtp.password': 'secret',
          'smtp.from': 'noreply@coescd.tj',
          'smtp.replyTo': 'dispatch@coescd.tj',
          'smtp.connectionTimeoutMs': 10000,
          'smtp.requireTls': true,
          'smtp.ignoreTls': false,
        };
        return key in values ? values[key] : defaultValue;
      }),
    } as unknown as jest.Mocked<ConfigService>;

    provider = new EmailNotificationProvider(profileRepo, credentialRepo, config);
  });

  it('sends email through nodemailer transport', async () => {
    const sendMail = jest.fn().mockResolvedValue({ messageId: 'smtp-1' });
    (nodemailer.createTransport as jest.Mock).mockReturnValue({ sendMail });

    await expect(
      provider.send({
        to: 'user@coescd.tj',
        subject: 'Alert',
        htmlBody: '<p>Alert</p>',
        textBody: 'Alert',
      }),
    ).resolves.toEqual({ success: true, messageId: 'smtp-1' });

    expect(sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        from: 'noreply@coescd.tj',
        to: 'user@coescd.tj',
        replyTo: 'dispatch@coescd.tj',
      }),
    );
  });

  it('throws when SMTP delivery is disabled', async () => {
    config.get.mockImplementation((key: string, defaultValue?: unknown) => {
      if (key === 'smtp.enabled') return false as any;
      return defaultValue as any;
    });

    await expect(
      provider.send({
        to: 'user@coescd.tj',
        subject: 'Alert',
        htmlBody: '<p>Alert</p>',
        textBody: 'Alert',
      }),
    ).rejects.toThrow('SMTP notification delivery is disabled');
  });

  it('resolves profile email for an active credential', async () => {
    credentialRepo.findOne.mockResolvedValue({
      id: 'cred-1',
      email: 'cred@coescd.tj',
      status: CredentialStatus.ACTIVE,
      isServiceAccount: false,
    } as UserCredential);
    profileRepo.findOne.mockResolvedValue({
      credentialId: 'cred-1',
      email: 'profile@coescd.tj',
      status: UserStatus.ACTIVE,
    } as UserProfile);

    await expect(provider.resolveEmailAddress('cred-1')).resolves.toBe('profile@coescd.tj');
  });

  it('returns null for inactive or service-account credentials', async () => {
    credentialRepo.findOne.mockResolvedValue({
      id: 'svc-1',
      email: 'svc@coescd.tj',
      status: CredentialStatus.SUSPENDED,
      isServiceAccount: true,
    } as UserCredential);

    await expect(provider.resolveEmailAddress('svc-1')).resolves.toBeNull();
  });
});
