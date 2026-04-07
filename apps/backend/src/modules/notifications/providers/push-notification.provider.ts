import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as webpush from 'web-push';
import type { PushSubscription as WebPushSubscription, SendResult } from 'web-push';

export interface PushPayload {
  title: string;
  body: string | null;
  actionUrl?: string | null;
  tag?: string;
  data?: Record<string, unknown>;
}

export interface PushResult {
  success: boolean;
  statusCode?: number;
  expired?: boolean;
  error?: string;
}

@Injectable()
export class PushNotificationProvider {
  private vapidConfigured = false;

  constructor(private readonly config: ConfigService) {}

  isEnabled(): boolean {
    return this.config.get<boolean>('webpush.enabled', false);
  }

  getPublicKey(): string {
    return this.config.get<string>('webpush.vapidPublicKey', '');
  }

  async send(subscription: WebPushSubscription, payload: PushPayload): Promise<PushResult> {
    if (!this.isEnabled()) {
      throw new Error('Web push delivery is disabled');
    }

    try {
      this.ensureVapidDetails();
      const result = await webpush.sendNotification(
        subscription,
        JSON.stringify({
          title: payload.title,
          body: payload.body,
          actionUrl: payload.actionUrl ?? null,
          tag: payload.tag ?? undefined,
          data: payload.data ?? {},
        }),
        {
          TTL: this.config.get<number>('webpush.ttlSeconds', 300),
          urgency: this.config.get<'very-low' | 'low' | 'normal' | 'high'>(
            'webpush.urgency',
            'high',
          ),
        },
      );

      return this.mapSuccess(result);
    } catch (error) {
      return this.mapFailure(error);
    }
  }

  private ensureVapidDetails(): void {
    if (this.vapidConfigured) {
      return;
    }

    const subject = this.config.get<string>('webpush.subject', 'mailto:alerts@coescd.local');
    const publicKey = this.getPublicKey();
    const privateKey = this.config.get<string>('webpush.vapidPrivateKey', '');

    if (!publicKey || !privateKey) {
      throw new Error('Web push VAPID keys are not configured');
    }

    webpush.setVapidDetails(subject, publicKey, privateKey);
    this.vapidConfigured = true;
  }

  private mapSuccess(result: SendResult): PushResult {
    return {
      success: result.statusCode >= 200 && result.statusCode < 300,
      statusCode: result.statusCode,
    };
  }

  private mapFailure(error: unknown): PushResult {
    const candidate = error as {
      statusCode?: number;
      body?: string;
      message?: string;
      headers?: Record<string, string>;
    };
    const statusCode = candidate.statusCode;
    const expired = statusCode === 404 || statusCode === 410;

    return {
      success: false,
      statusCode,
      expired,
      error: candidate.body || candidate.message || 'Unknown web push error',
    };
  }
}
