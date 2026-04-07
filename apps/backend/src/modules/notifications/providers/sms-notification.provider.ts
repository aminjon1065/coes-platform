import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';

import { UserProfile, UserStatus } from '../../users/entities/user-profile.entity';
import { UserCredential, CredentialStatus } from '../../iam/entities/user-credential.entity';

export interface SmsPayload {
  to: string;
  body: string;
}

export interface SmsResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

@Injectable()
export class SmsNotificationProvider {
  private readonly logger = new Logger(SmsNotificationProvider.name);

  constructor(
    @InjectRepository(UserProfile)
    private readonly profileRepo: Repository<UserProfile>,
    @InjectRepository(UserCredential)
    private readonly credentialRepo: Repository<UserCredential>,
    private readonly config: ConfigService,
  ) {}

  async send(payload: SmsPayload): Promise<SmsResult> {
    if (!this.config.get<boolean>('sms.enabled', false)) {
      throw new Error('SMS notification delivery is disabled');
    }

    const providerUrl = this.config.get<string>('sms.providerUrl', '');
    if (!providerUrl) {
      throw new Error('SMS provider URL is not configured');
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.get<number>('sms.timeoutMs', 10000));

    try {
      const authToken = this.config.get<string>('sms.providerToken', '');
      const authHeader = this.config.get<string>('sms.authHeader', 'Authorization');
      const tokenPrefix = this.config.get<string>('sms.tokenPrefix', 'Bearer ');
      const sender = this.config.get<string>('sms.sender', '');

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (authToken) {
        headers[authHeader] = `${tokenPrefix}${authToken}`;
      }

      const response = await fetch(providerUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          to: payload.to,
          body: payload.body,
          from: sender || undefined,
        }),
        signal: controller.signal,
      });

      const responseText = await response.text();
      if (!response.ok) {
        return {
          success: false,
          error: `SMS gateway ${response.status}: ${responseText.substring(0, 200)}`,
        };
      }

      let parsed: any = null;
      if (responseText) {
        try {
          parsed = JSON.parse(responseText);
        } catch {
          parsed = null;
        }
      }

      return {
        success: true,
        messageId: parsed?.messageId ?? parsed?.id ?? undefined,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown SMS provider error';
      this.logger.error(`SMS delivery failed: ${message}`);
      return { success: false, error: message };
    } finally {
      clearTimeout(timeout);
    }
  }

  async resolvePhoneNumber(userId: string): Promise<string | null> {
    const { credential, profile } = await this.resolveUserContext(userId);
    if (!credential || credential.status !== CredentialStatus.ACTIVE || credential.isServiceAccount) {
      return null;
    }
    if (!profile || profile.status !== UserStatus.ACTIVE || !profile.phone) {
      return null;
    }

    return this.normalizePhoneNumber(profile.phone);
  }

  private async resolveUserContext(
    userId: string,
  ): Promise<{ credential: UserCredential | null; profile: UserProfile | null }> {
    const directCredential = await this.credentialRepo.findOne({ where: { id: userId } });
    if (directCredential) {
      const profile = await this.profileRepo.findOne({ where: { credentialId: directCredential.id } });
      return { credential: directCredential, profile };
    }

    const profile = await this.profileRepo.findOne({
      where: [{ id: userId }, { credentialId: userId }],
    });
    if (!profile) {
      return { credential: null, profile: null };
    }

    const credential = await this.credentialRepo.findOne({ where: { id: profile.credentialId } });
    return { credential, profile };
  }

  private normalizePhoneNumber(phone: string): string | null {
    const compact = phone.replace(/[^\d+]/g, '');
    if (compact.startsWith('+')) {
      return compact;
    }
    if (compact.startsWith('00')) {
      return `+${compact.slice(2)}`;
    }
    if (!/^\d+$/.test(compact)) {
      return null;
    }

    const defaultCountryCode = this.config.get<string>('sms.defaultCountryCode', '');
    if (defaultCountryCode) {
      return `+${defaultCountryCode}${compact}`;
    }

    return compact;
  }
}
