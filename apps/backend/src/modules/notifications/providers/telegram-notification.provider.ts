import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface TelegramPayload {
  chatId: string;
  text: string;
}

export interface TelegramResult {
  success: boolean;
  messageId?: string;
  error?: string;
  invalid?: boolean;
}

@Injectable()
export class TelegramNotificationProvider {
  private readonly logger = new Logger(TelegramNotificationProvider.name);

  constructor(private readonly config: ConfigService) {}

  isEnabled(): boolean {
    return this.config.get<boolean>('telegram.enabled', false);
  }

  async send(payload: TelegramPayload): Promise<TelegramResult> {
    if (!this.isEnabled()) {
      throw new Error('Telegram notification delivery is disabled');
    }

    const botToken = this.config.get<string>('telegram.botToken', '');
    if (!botToken) {
      throw new Error('Telegram bot token is not configured');
    }

    const apiBaseUrl = this.config.get<string>('telegram.apiBaseUrl', 'https://api.telegram.org');
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      this.config.get<number>('telegram.timeoutMs', 10000),
    );

    try {
      const response = await fetch(`${apiBaseUrl}/bot${botToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: payload.chatId,
          text: payload.text,
          disable_web_page_preview: this.config.get<boolean>('telegram.disableLinkPreview', true),
        }),
        signal: controller.signal,
      });

      const raw = await response.text();
      let parsed: any = null;
      if (raw) {
        try {
          parsed = JSON.parse(raw);
        } catch {
          parsed = null;
        }
      }

      if (!response.ok || parsed?.ok === false) {
        const description = parsed?.description ?? raw.substring(0, 200) ?? 'Telegram API error';
        return {
          success: false,
          invalid: response.status === 400 || response.status === 403,
          error: `Telegram API ${response.status}: ${description}`,
        };
      }

      return {
        success: true,
        messageId: parsed?.result?.message_id?.toString(),
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown Telegram provider error';
      this.logger.error(`Telegram delivery failed: ${message}`);
      return { success: false, error: message };
    } finally {
      clearTimeout(timeout);
    }
  }
}
