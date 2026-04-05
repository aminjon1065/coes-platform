import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { Notification } from './entities/notification.entity';
import { NotificationPreference } from './entities/notification-preference.entity';
import { NotificationDelivery } from './entities/notification-delivery.entity';

import { NotificationService } from './services/notification.service';
import { EmailNotificationProvider } from './providers/email-notification.provider';
import { SmsNotificationProvider } from './providers/sms-notification.provider';

import { NotificationController } from './controllers/notification.controller';
import { NotificationDomainListener } from './listeners/notification-domain.listener';

/**
 * 2.6 — Notification Service module.
 *
 * Listens to 'notification.requested' events emitted by all domain modules
 * (Tasks, EDMS, IAM, etc.) and dispatches notifications via:
 *   - In-app (persisted in DB, queried via REST)
 *   - Email (via EmailNotificationProvider — SMTP stub)
 *   - SMS   (via SmsNotificationProvider  — gateway stub)
 *
 * Preferences are stored per-user per-notification-type (2.6.5).
 * Delivery is tracked per-channel (2.6.7).
 * Throttling is enforced for email to prevent alert fatigue (2.6.6).
 * CRITICAL notifications bypass throttle and escalate to SMS (2.6.8).
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      Notification,
      NotificationPreference,
      NotificationDelivery,
    ]),
  ],
  controllers: [NotificationController],
  providers: [
    NotificationService,
    EmailNotificationProvider,
    SmsNotificationProvider,
    NotificationDomainListener,
  ],
  exports: [NotificationService],
})
export class NotificationsModule {}
