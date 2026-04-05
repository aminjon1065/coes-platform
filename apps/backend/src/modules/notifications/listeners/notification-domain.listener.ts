import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { NotificationService, NotificationRequest } from '../services/notification.service';

/**
 * 2.6.2 — Domain event listener that bridges the platform event bus to the
 * Notification Service.
 *
 * Any module that needs to send a notification emits 'notification.requested'
 * with a NotificationRequest payload. This listener receives that event and
 * delegates to NotificationService.dispatch() for persistence + channel dispatch.
 *
 * This decouples all domain modules from the Notifications module — they simply
 * emit events without importing NotificationService.
 */
@Injectable()
export class NotificationDomainListener {
  private readonly logger = new Logger(NotificationDomainListener.name);

  constructor(private readonly notificationService: NotificationService) {}

  @OnEvent('notification.requested')
  async onNotificationRequested(payload: NotificationRequest): Promise<void> {
    try {
      await this.notificationService.dispatch(payload);
    } catch (err) {
      // Never let notification failures bubble up and break the emitting domain's transaction
      this.logger.error(
        `Failed to dispatch notification (type=${payload.type}, recipient=${payload.recipientPositionId}): ${(err as Error).message}`,
        (err as Error).stack,
      );
    }
  }

  /**
   * Presence-change: when a user comes back online after a long absence,
   * check for unread CRITICAL notifications and resurface them.
   */
  @OnEvent('presence.changed')
  async onPresenceChanged(payload: {
    userId: string;
    from: string;
    to: string;
  }): Promise<void> {
    if (payload.to !== 'online' || payload.from !== 'offline') return;
    // Minor housekeeping: no escalation on reconnect in this implementation.
    // Production could resurface unread CRITICAL notifications here.
  }
}
