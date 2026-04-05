import { Injectable, Logger } from '@nestjs/common';

export interface SmsPayload {
  to: string;        // E.164 phone number, e.g. +992xxxxxxxxx
  body: string;      // max 160 chars for single SMS
}

export interface SmsResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

/**
 * 2.6.4 — SMS notification provider.
 *
 * Adapter pattern: replace `send()` body with actual gateway calls
 * (e.g. Kazinform, Beeline Tajikistan, or Twilio for testing).
 *
 * Current implementation is a logged stub.
 */
@Injectable()
export class SmsNotificationProvider {
  private readonly logger = new Logger(SmsNotificationProvider.name);

  async send(payload: SmsPayload): Promise<SmsResult> {
    // ── Production stub ──────────────────────────────────────────────────────
    // Replace with real SMS gateway:
    //   const resp = await this.httpService.post(gatewayUrl, { ... }).toPromise();
    //   return { success: true, messageId: resp.data.id };
    // ────────────────────────────────────────────────────────────────────────
    this.logger.log(`[SMS] To: ${payload.to} | Body: ${payload.body.substring(0, 80)}`);

    return {
      success: true,
      messageId: `stub-sms-${Date.now()}`,
    };
  }

  /**
   * Resolve phone number for a user.
   * In production queries iam.users.phone / users.user_profiles.phone.
   * Returns null if no verified mobile number on file.
   */
  async resolvePhoneNumber(userId: string): Promise<string | null> {
    this.logger.debug(`[SMS] resolvePhoneNumber(${userId}) — stub returns null`);
    return null;
  }
}
