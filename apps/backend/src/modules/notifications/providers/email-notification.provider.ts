import { Injectable, Logger } from '@nestjs/common';

export interface EmailPayload {
  to: string;              // recipient email address
  subject: string;
  htmlBody: string;
  textBody: string;
  replyTo?: string;
}

export interface EmailResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

/**
 * 2.6.3 — Email notification provider.
 *
 * Adapter pattern: swapped out for a real Nodemailer / SMTP transport
 * in production. Currently logs the email for development and CI environments.
 *
 * To wire a real transport, inject SmtpConfig and replace `send()` body.
 */
@Injectable()
export class EmailNotificationProvider {
  private readonly logger = new Logger(EmailNotificationProvider.name);

  async send(payload: EmailPayload): Promise<EmailResult> {
    // ── Production stub ──────────────────────────────────────────────────────
    // Replace with:
    //   const info = await this.transporter.sendMail({ ... });
    //   return { success: true, messageId: info.messageId };
    // ────────────────────────────────────────────────────────────────────────
    this.logger.log(
      `[EMAIL] To: ${payload.to} | Subject: ${payload.subject}`,
    );
    this.logger.debug(`[EMAIL BODY] ${payload.textBody.substring(0, 200)}`);

    // Simulate success for stub
    return {
      success: true,
      messageId: `stub-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    };
  }

  /**
   * Look up email address for a user ID.
   * In production this would query the IAM / Users schema.
   * Returns null if user has no verified email.
   */
  async resolveEmailAddress(userId: string): Promise<string | null> {
    // TODO: inject UsersService or query iam.users.email directly
    // For now, return null so email delivery is gracefully skipped
    this.logger.debug(`[EMAIL] resolveEmailAddress(${userId}) — stub returns null`);
    return null;
  }
}
