import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, IsNull } from 'typeorm';

import {
  Notification,
  NotificationPriority,
} from '../entities/notification.entity';
import { NotificationPreference } from '../entities/notification-preference.entity';
import {
  NotificationDelivery,
  DeliveryChannel,
  DeliveryStatus,
} from '../entities/notification-delivery.entity';
import {
  PushSubscription,
  PushSubscriptionStatus,
} from '../entities/push-subscription.entity';
import {
  TelegramSubscription,
  TelegramSubscriptionStatus,
} from '../entities/telegram-subscription.entity';
import { EmailNotificationProvider } from '../providers/email-notification.provider';
import { SmsNotificationProvider } from '../providers/sms-notification.provider';
import {
  PushNotificationProvider,
  type PushPayload,
} from '../providers/push-notification.provider';
import { TelegramNotificationProvider } from '../providers/telegram-notification.provider';
import { ListNotificationsDto } from '../dto/list-notifications.dto';
import { UpdatePreferenceDto } from '../dto/update-preference.dto';
import { RegisterPushSubscriptionDto } from '../dto/register-push-subscription.dto';
import { RegisterTelegramSubscriptionDto } from '../dto/register-telegram-subscription.dto';
import { UserPositionAssignment, AssignmentType } from '../../users/entities/user-position-assignment.entity';
import type { PushSubscription as WebPushSubscription } from 'web-push';

/** Payload shape emitted by all domain services via 'notification.requested' */
export interface NotificationRequest {
  type: string;
  recipientPositionId: string;
  priority?: 'low' | 'normal' | 'high' | 'critical';
  payload?: Record<string, unknown>;
  /** Optional: if calling code already resolved the user ID */
  recipientUserId?: string;
}

/** Title/body template resolver */
const TEMPLATES: Record<
  string,
  (p: Record<string, unknown>) => { title: string; body: string; actionUrl?: string }
> = {
  TASK_OVERDUE_ESCALATION: (p) => ({
    title: `Overdue task escalation`,
    body: `Task "${p.taskTitle}" assigned to executor is overdue (deadline: ${p.deadline ?? 'unset'}). Role: ${p.role}.`,
    actionUrl: `/tasks/${p.taskId}`,
  }),
  TASK_OVERDUE_EXECUTOR: (p) => ({
    title: `Your task is overdue`,
    body: `Task "${p.taskTitle}" has passed its deadline (${p.deadline ?? 'unset'}).`,
    actionUrl: `/tasks/${p.taskId}`,
  }),
  TASK_CANNOT_EXECUTE: (p) => ({
    title: `Task reported as unexecutable`,
    body: `Task "${p.taskTitle}" was reported as cannot-execute. Reason: ${p.reason ?? 'not provided'}.`,
    actionUrl: `/tasks/${p.taskId}`,
  }),
  TASK_AWAITING_VERIFICATION: (p) => ({
    title: `Task awaiting your verification`,
    body: `Task "${p.taskTitle}" has been completed and requires your verification.`,
    actionUrl: `/tasks/${p.taskId}`,
  }),
  TASK_ALL_SUBTASKS_COMPLETE: (p) => ({
    title: `All subtasks completed`,
    body: `All subtasks of "${p.taskTitle}" are complete. You may now mark the parent task as completed.`,
    actionUrl: `/tasks/${p.taskId}`,
  }),
  TASK_SUBTASK_BLOCKED: (p) => ({
    title: `Subtask is blocked`,
    body: `A subtask of "${p.taskTitle}" is in a blocked state (${p.blockedStatus}). Review may be required.`,
    actionUrl: `/tasks/${p.taskId}`,
  }),
};

const DEFAULT_TEMPLATE = (type: string, p: Record<string, unknown>) => ({
  title: `Notification: ${type}`,
  body: JSON.stringify(p).substring(0, 500),
});

/** Priority ordering for SMS minimum-priority filtering */
const PRIORITY_WEIGHT: Record<NotificationPriority, number> = {
  [NotificationPriority.LOW]: 0,
  [NotificationPriority.NORMAL]: 1,
  [NotificationPriority.HIGH]: 2,
  [NotificationPriority.CRITICAL]: 3,
};

const ASSIGNMENT_WEIGHT: Record<AssignmentType, number> = {
  [AssignmentType.PRIMARY]: 0,
  [AssignmentType.ACTING]: 1,
  [AssignmentType.CONCURRENT]: 2,
};

/**
 * 2.6.1–2.6.8 — Core notification service.
 *
 * Handles:
 *  - Creating & persisting in-app notifications
 *  - Resolving delivery preferences per user/type
 *  - Throttling email delivery
 *  - Dispatching to Email and SMS providers
 *  - Dispatching to Telegram bot provider
 *  - Dispatching to Web Push providers
 *  - Delivery tracking
 *  - Read-state management
 *  - Priority-based escalation (CRITICAL prefers Telegram, falls back to legacy SMS)
 */
@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);

  constructor(
    @InjectRepository(Notification)
    private readonly notifRepo: Repository<Notification>,

    @InjectRepository(NotificationPreference)
    private readonly prefRepo: Repository<NotificationPreference>,

    @InjectRepository(NotificationDelivery)
    private readonly deliveryRepo: Repository<NotificationDelivery>,

    @InjectRepository(PushSubscription)
    private readonly pushSubscriptionRepo: Repository<PushSubscription>,

    @InjectRepository(TelegramSubscription)
    private readonly telegramSubscriptionRepo: Repository<TelegramSubscription>,

    @InjectRepository(UserPositionAssignment)
    private readonly assignmentRepo: Repository<UserPositionAssignment>,

    private readonly emailProvider: EmailNotificationProvider,
    private readonly smsProvider: SmsNotificationProvider,
    private readonly pushProvider: PushNotificationProvider,
    private readonly telegramProvider: TelegramNotificationProvider,
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  // ─── Core dispatch ────────────────────────────────────────────────────────────

  /**
   * Main entry point called by NotificationDomainListener.
   * Creates the notification record and dispatches to all enabled channels.
   */
  async dispatch(req: NotificationRequest): Promise<void> {
    const priority = this.mapPriority(req.priority ?? 'normal');
    const tpl =
      TEMPLATES[req.type]?.(req.payload ?? {}) ??
      DEFAULT_TEMPLATE(req.type, req.payload ?? {});
    const recipientUserId = await this.resolveRecipientCredentialId(req);

    // ── Create in-app notification (always) ───────────────────────────────────
    const notification = this.notifRepo.create({
      type: req.type,
      recipientPositionId: req.recipientPositionId,
      recipientUserId: recipientUserId,
      priority,
      title: tpl.title,
      body: tpl.body,
      actionUrl: tpl.actionUrl ?? null,
      payload: req.payload ?? null,
    });
    await this.notifRepo.save(notification);

    // ── Resolve delivery preferences ──────────────────────────────────────────
    const userId = recipientUserId;
    if (!userId) {
      // No resolved user — in-app only (will be picked up when user logs in)
      await this.createDelivery(notification.id, DeliveryChannel.IN_APP, DeliveryStatus.SENT);
      return;
    }

    const prefs = await this.resolvePreferences(userId, req.type);

    // In-app
    if (prefs.inApp) {
      await this.createDelivery(notification.id, DeliveryChannel.IN_APP, DeliveryStatus.SENT);
    }

    // Email
    if (prefs.email) {
      await this.dispatchEmail(notification, userId, prefs.emailThrottleMinutes, req.type);
    } else {
      await this.createDelivery(notification.id, DeliveryChannel.EMAIL, DeliveryStatus.SKIPPED);
    }

    // SMS — honour minimum priority setting; CRITICAL always goes through
    const meetsSmsPriority =
      priority === NotificationPriority.CRITICAL ||
      PRIORITY_WEIGHT[priority] >= PRIORITY_WEIGHT[prefs.smsMinPriority];

    if (prefs.sms && meetsSmsPriority) {
      await this.dispatchSms(notification, userId);
    } else {
      await this.createDelivery(notification.id, DeliveryChannel.SMS, DeliveryStatus.SKIPPED);
    }

    const meetsTelegramPriority =
      priority === NotificationPriority.CRITICAL ||
      PRIORITY_WEIGHT[priority] >= PRIORITY_WEIGHT[prefs.telegramMinPriority];

    if (prefs.telegram && meetsTelegramPriority) {
      await this.dispatchTelegram(notification, userId);
    }

    // Web Push — only for users with active subscriptions
    if (prefs.push) {
      await this.dispatchPush(notification, userId);
    } else {
      await this.createDelivery(notification.id, DeliveryChannel.PUSH, DeliveryStatus.SKIPPED);
    }
  }

  // ─── Telegram dispatch ────────────────────────────────────────────────────────

  private async dispatchTelegram(
    notification: Notification,
    userId: string,
  ): Promise<boolean> {
    const delivery = await this.createDelivery(
      notification.id,
      DeliveryChannel.TELEGRAM,
      DeliveryStatus.PENDING,
    );

    if (!this.telegramProvider.isEnabled()) {
      await this.updateDelivery(delivery.id, DeliveryStatus.SKIPPED, null, 'telegram delivery disabled');
      return false;
    }

    const subscription = await this.telegramSubscriptionRepo.findOne({
      where: { userId },
    });

    if (!subscription || subscription.status !== TelegramSubscriptionStatus.ACTIVE) {
      await this.updateDelivery(delivery.id, DeliveryStatus.SKIPPED, null, 'no active telegram subscription');
      return false;
    }

    const result = await this.telegramProvider.send({
      chatId: subscription.chatId,
      text: this.buildTelegramText(notification),
    });

    if (result.success) {
      await this.telegramSubscriptionRepo.update(subscription.id, {
        status: TelegramSubscriptionStatus.ACTIVE,
        lastSuccessAt: new Date(),
        lastFailureAt: null,
        lastFailureReason: null,
      });
      await this.updateDelivery(delivery.id, DeliveryStatus.SENT, result.messageId ?? null);
      return true;
    }

    await this.telegramSubscriptionRepo.update(subscription.id, {
      status: result.invalid ? TelegramSubscriptionStatus.INVALID : subscription.status,
      lastFailureAt: new Date(),
      lastFailureReason: result.error ?? 'telegram delivery failed',
    });
    await this.updateDelivery(delivery.id, DeliveryStatus.FAILED, null, result.error);
    return false;
  }

  // ─── Email dispatch ───────────────────────────────────────────────────────────

  private async dispatchEmail(
    notification: Notification,
    userId: string,
    throttleMinutes: number,
    type: string,
  ): Promise<void> {
    const delivery = await this.createDelivery(
      notification.id,
      DeliveryChannel.EMAIL,
      DeliveryStatus.PENDING,
    );

    // ── Throttle check (2.6.6) ─────────────────────────────────────────────
    // CRITICAL bypasses throttle entirely
    if (throttleMinutes > 0 && notification.priority !== NotificationPriority.CRITICAL) {
      const since = new Date(Date.now() - throttleMinutes * 60_000);
      const recentDelivery = await this.deliveryRepo
        .createQueryBuilder('d')
        .innerJoin('d.notification', 'n')
        .where('n.recipient_user_id = :userId', { userId })
        .andWhere('n.type = :type', { type })
        .andWhere('d.channel = :ch', { ch: DeliveryChannel.EMAIL })
        .andWhere('d.status = :st', { st: DeliveryStatus.SENT })
        .andWhere('d.sent_at >= :since', { since })
        .getOne();

      if (recentDelivery) {
        await this.updateDelivery(delivery.id, DeliveryStatus.SKIPPED, null, 'throttled');
        this.logger.debug(
          `Email throttled for user ${userId} type ${type} (throttle: ${throttleMinutes}m)`,
        );
        return;
      }
    }

    const emailAddress = await this.emailProvider.resolveEmailAddress(userId);
    if (!emailAddress) {
      await this.updateDelivery(delivery.id, DeliveryStatus.SKIPPED, null, 'no email address on file');
      return;
    }

    try {
      const result = await this.emailProvider.send({
        to: emailAddress,
        subject: notification.title,
        htmlBody: `<p>${notification.body ?? notification.title}</p>` +
          (notification.actionUrl
            ? `<p><a href="${notification.actionUrl}">View in system</a></p>`
            : ''),
        textBody: `${notification.body ?? notification.title}${notification.actionUrl ? `\n\n${notification.actionUrl}` : ''}`,
      });

      if (result.success) {
        await this.updateDelivery(delivery.id, DeliveryStatus.SENT, result.messageId);
      } else {
        await this.updateDelivery(delivery.id, DeliveryStatus.FAILED, null, result.error);
      }
    } catch (err) {
      await this.updateDelivery(delivery.id, DeliveryStatus.FAILED, null, (err as Error).message);
      this.logger.error(`Email dispatch failed for notification ${notification.id}: ${(err as Error).message}`);
    }
  }

  // ─── SMS dispatch ─────────────────────────────────────────────────────────────

  private async dispatchSms(notification: Notification, userId: string): Promise<void> {
    const delivery = await this.createDelivery(
      notification.id,
      DeliveryChannel.SMS,
      DeliveryStatus.PENDING,
    );

    const phone = await this.smsProvider.resolvePhoneNumber(userId);
    if (!phone) {
      await this.updateDelivery(delivery.id, DeliveryStatus.SKIPPED, null, 'no phone number on file');
      return;
    }

    // SMS body: title + short action hint, max ~160 chars
    const smsBody = `${notification.title}${notification.actionUrl ? ` | ${notification.actionUrl}` : ''}`.substring(0, 160);

    try {
      const result = await this.smsProvider.send({ to: phone, body: smsBody });
      if (result.success) {
        await this.updateDelivery(delivery.id, DeliveryStatus.SENT, result.messageId);
      } else {
        await this.updateDelivery(delivery.id, DeliveryStatus.FAILED, null, result.error);
      }
    } catch (err) {
      await this.updateDelivery(delivery.id, DeliveryStatus.FAILED, null, (err as Error).message);
      this.logger.error(`SMS dispatch failed for notification ${notification.id}: ${(err as Error).message}`);
    }
  }

  // ─── Web Push dispatch ────────────────────────────────────────────────────────

  private async dispatchPush(notification: Notification, userId: string): Promise<void> {
    const delivery = await this.createDelivery(
      notification.id,
      DeliveryChannel.PUSH,
      DeliveryStatus.PENDING,
    );

    if (!this.pushProvider.isEnabled()) {
      await this.updateDelivery(delivery.id, DeliveryStatus.SKIPPED, null, 'web push disabled');
      return;
    }

    const subscriptions = await this.pushSubscriptionRepo.find({
      where: { userId, status: PushSubscriptionStatus.ACTIVE },
      order: { updatedAt: 'DESC' },
    });

    if (!subscriptions.length) {
      await this.updateDelivery(delivery.id, DeliveryStatus.SKIPPED, null, 'no active push subscriptions');
      return;
    }

    const payload: PushPayload = {
      title: notification.title,
      body: notification.body,
      actionUrl: notification.actionUrl,
      tag: notification.id,
      data: {
        notificationId: notification.id,
        type: notification.type,
        priority: notification.priority,
        actionUrl: notification.actionUrl,
        payload: notification.payload ?? {},
      },
    };

    let successCount = 0;
    const errors: string[] = [];

    for (const subscription of subscriptions) {
      const result = await this.pushProvider.send(
        this.toWebPushSubscription(subscription),
        payload,
      );

      if (result.success) {
        successCount += 1;
        await this.pushSubscriptionRepo.update(subscription.id, {
          status: PushSubscriptionStatus.ACTIVE,
          failureCount: 0,
          lastSuccessAt: new Date(),
          lastFailureAt: null,
          lastFailureReason: null,
        });
        continue;
      }

      errors.push(result.error ?? 'push delivery failed');

      if (result.expired) {
        await this.pushSubscriptionRepo.update(subscription.id, {
          status: PushSubscriptionStatus.EXPIRED,
          failureCount: subscription.failureCount + 1,
          lastFailureAt: new Date(),
          lastFailureReason: result.error ?? 'push subscription expired',
        });
        continue;
      }

      await this.pushSubscriptionRepo.update(subscription.id, {
        failureCount: subscription.failureCount + 1,
        lastFailureAt: new Date(),
        lastFailureReason: result.error ?? 'push delivery failed',
      });
    }

    if (successCount > 0) {
      const summary =
        errors.length > 0 ? `partial push delivery: ${successCount}/${subscriptions.length}` : undefined;
      await this.updateDelivery(delivery.id, DeliveryStatus.SENT, null, summary);
      return;
    }

    await this.updateDelivery(
      delivery.id,
      DeliveryStatus.FAILED,
      null,
      errors.join('; ').substring(0, 500) || 'push delivery failed',
    );
  }

  // ─── Preference resolution (2.6.5) ───────────────────────────────────────────

  /**
   * Resolve effective preferences for a user + notification type.
   * Specific-type row overrides default (null type) row.
   * Fallback hardcoded defaults: in_app=true, email=true, sms=false.
   */
  async resolvePreferences(
    userId: string,
    type: string,
   ): Promise<{
    inApp: boolean;
    email: boolean;
    sms: boolean;
    telegram: boolean;
    push: boolean;
    emailThrottleMinutes: number;
    smsMinPriority: NotificationPriority;
    telegramMinPriority: NotificationPriority;
  }> {
    const rows = await this.prefRepo.find({
      where: [
        { userId, notificationType: IsNull() },
        { userId, notificationType: type },
      ],
    });

    // Default row (type = null)
    const defaults = rows.find((r) => r.notificationType === null);
    // Specific override
    const specific = rows.find((r) => r.notificationType === type);
    const effective = specific ?? defaults;

    return {
      inApp: effective?.inApp ?? true,
      email: effective?.email ?? true,
      sms: effective?.sms ?? false,
      telegram: effective?.telegram ?? false,
      push: effective?.push ?? true,
      emailThrottleMinutes: effective?.emailThrottleMinutes ?? 0,
      smsMinPriority: effective?.smsMinPriority ?? NotificationPriority.HIGH,
      telegramMinPriority: effective?.telegramMinPriority ?? NotificationPriority.HIGH,
    };
  }

  // ─── Read management (2.6.2) ──────────────────────────────────────────────────

  async listForUser(
    userId: string,
    positionId: string,
    query: ListNotificationsDto,
  ): Promise<{ items: Notification[]; total: number; unreadCount: number }> {
    const qb = this.notifRepo
      .createQueryBuilder('n')
      .where('(n.recipient_user_id = :userId OR n.recipient_position_id = :positionId)', {
        userId,
        positionId,
      });

    if (query.unreadOnly) {
      qb.andWhere('n.is_read = false');
    }
    if (query.type) {
      qb.andWhere('n.type = :type', { type: query.type });
    }
    if (query.priority) {
      qb.andWhere('n.priority = :priority', { priority: query.priority });
    }

    // Exclude expired
    qb.andWhere('(n.expires_at IS NULL OR n.expires_at > NOW())');

    const [items, total] = await qb
      .orderBy('n.created_at', 'DESC')
      .skip(query.offset ?? 0)
      .take(query.limit ?? 50)
      .getManyAndCount();

    const unreadCount = await this.notifRepo.count({
      where: { recipientUserId: userId, isRead: false },
    });

    return { items, total, unreadCount };
  }

  async markRead(notificationId: string, userId: string): Promise<void> {
    const notif = await this.notifRepo.findOne({ where: { id: notificationId } });
    if (!notif) throw new NotFoundException('Notification not found');
    if (notif.recipientUserId !== userId) throw new ForbiddenException('Not your notification');
    if (notif.isRead) return;

    await this.notifRepo.update(notificationId, {
      isRead: true,
      readAt: new Date(),
    });
  }

  async markAllRead(userId: string): Promise<{ updated: number }> {
    const result = await this.notifRepo
      .createQueryBuilder()
      .update(Notification)
      .set({ isRead: true, readAt: new Date() })
      .where('recipient_user_id = :userId', { userId })
      .andWhere('is_read = false')
      .execute();

    return { updated: result.affected ?? 0 };
  }

  // ─── Preference CRUD (2.6.5) ──────────────────────────────────────────────────

  async getPreferences(userId: string): Promise<NotificationPreference[]> {
    return this.prefRepo.find({ where: { userId }, order: { notificationType: 'ASC' } });
  }

  async updatePreference(userId: string, dto: UpdatePreferenceDto): Promise<NotificationPreference> {
    let pref: NotificationPreference | null;
    if (dto.notificationType) {
      pref = await this.prefRepo.findOne({ where: { userId, notificationType: dto.notificationType } });
    } else {
      pref = await this.prefRepo.findOne({ where: { userId, notificationType: IsNull() } });
    }

    if (!pref) {
      pref = this.prefRepo.create({
        userId,
        notificationType: dto.notificationType ?? null,
      });
    }

    if (dto.inApp !== undefined) pref.inApp = dto.inApp;
    if (dto.email !== undefined) pref.email = dto.email;
    if (dto.sms !== undefined) pref.sms = dto.sms;
    if (dto.telegram !== undefined) pref.telegram = dto.telegram;
    if (dto.push !== undefined) pref.push = dto.push;
    if (dto.emailThrottleMinutes !== undefined) pref.emailThrottleMinutes = dto.emailThrottleMinutes;
    if (dto.smsMinPriority !== undefined) pref.smsMinPriority = dto.smsMinPriority;
    if (dto.telegramMinPriority !== undefined) pref.telegramMinPriority = dto.telegramMinPriority;

    return this.prefRepo.save(pref);
  }

  // ─── Push subscription management ─────────────────────────────────────────────

  async listPushSubscriptions(userId: string): Promise<PushSubscription[]> {
    return this.pushSubscriptionRepo.find({
      where: { userId },
      order: { updatedAt: 'DESC' },
    });
  }

  async registerPushSubscription(
    userId: string,
    dto: RegisterPushSubscriptionDto,
    userAgent?: string | null,
  ): Promise<PushSubscription> {
    const existing = await this.pushSubscriptionRepo.findOne({
      where: { endpoint: dto.endpoint },
    });

    const subscription = existing ?? this.pushSubscriptionRepo.create();
    subscription.userId = userId;
    subscription.endpoint = dto.endpoint;
    subscription.p256dhKey = dto.keys.p256dh;
    subscription.authKey = dto.keys.auth;
    subscription.expirationTime =
      dto.expirationTime !== undefined && dto.expirationTime !== null
        ? new Date(dto.expirationTime)
        : null;
    subscription.userAgent = userAgent ?? null;
    subscription.status = PushSubscriptionStatus.ACTIVE;
    subscription.failureCount = 0;
    subscription.lastFailureAt = null;
    subscription.lastFailureReason = null;

    return this.pushSubscriptionRepo.save(subscription);
  }

  async removePushSubscription(userId: string, endpoint: string): Promise<void> {
    await this.pushSubscriptionRepo.delete({ userId, endpoint });
  }

  // ─── Telegram subscription management ────────────────────────────────────────

  async getTelegramSubscription(userId: string): Promise<TelegramSubscription | null> {
    return this.telegramSubscriptionRepo.findOne({ where: { userId } });
  }

  async registerTelegramSubscription(
    userId: string,
    dto: RegisterTelegramSubscriptionDto,
  ): Promise<TelegramSubscription> {
    const existingByChat = await this.telegramSubscriptionRepo.findOne({
      where: { chatId: dto.chatId },
    });
    if (existingByChat && existingByChat.userId !== userId) {
      throw new ForbiddenException('Telegram chat is already linked to another user');
    }

    const existingByUser = await this.telegramSubscriptionRepo.findOne({
      where: { userId },
    });

    const subscription = existingByUser ?? existingByChat ?? this.telegramSubscriptionRepo.create();
    subscription.userId = userId;
    subscription.chatId = dto.chatId;
    subscription.username = dto.username?.trim() || null;
    subscription.displayName = dto.displayName?.trim() || null;
    subscription.status = TelegramSubscriptionStatus.ACTIVE;
    subscription.lastFailureAt = null;
    subscription.lastFailureReason = null;

    return this.telegramSubscriptionRepo.save(subscription);
  }

  async removeTelegramSubscription(userId: string): Promise<void> {
    const subscription = await this.telegramSubscriptionRepo.findOne({ where: { userId } });
    if (!subscription) {
      return;
    }

    await this.telegramSubscriptionRepo.update(subscription.id, {
      status: TelegramSubscriptionStatus.REVOKED,
      lastFailureAt: null,
      lastFailureReason: null,
    });
  }

  // ─── Escalation (2.6.8) ───────────────────────────────────────────────────────

  /**
   * Re-sends a notification via Telegram first if the notification remains
   * unread past the escalation threshold. Falls back to legacy SMS only when
   * Telegram is unavailable and SMS integration remains enabled.
   *
   * Called by a scheduled job (e.g. every 30 min) for CRITICAL / HIGH unread notifications.
   */
  async escalateUnreadCritical(): Promise<void> {
    const threshold = new Date(Date.now() - 30 * 60_000); // 30 minutes

    const overdue = await this.notifRepo.find({
      where: {
        isRead: false,
        priority: NotificationPriority.CRITICAL,
      },
      // Only escalate if created before threshold and not already escalated in this window
    });

    for (const notif of overdue) {
      if (notif.createdAt > threshold) continue; // too recent
      if (!notif.recipientUserId) continue;

      this.logger.warn(`Escalating unread CRITICAL notification ${notif.id} for user ${notif.recipientUserId}`);

      const telegramSent = await this.dispatchTelegram(notif, notif.recipientUserId);
      if (!telegramSent) {
        await this.dispatchSms(notif, notif.recipientUserId);
      }
    }
  }

  // ─── Delivery summary ─────────────────────────────────────────────────────────

  async getDeliveryStatus(notificationId: string): Promise<NotificationDelivery[]> {
    return this.deliveryRepo.find({
      where: { notificationId },
      order: { channel: 'ASC' },
    });
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────────

  private async createDelivery(
    notificationId: string,
    channel: DeliveryChannel,
    status: DeliveryStatus,
  ): Promise<NotificationDelivery> {
    const delivery = this.deliveryRepo.create({ notificationId, channel, status });
    return this.deliveryRepo.save(delivery);
  }

  private async updateDelivery(
    deliveryId: string,
    status: DeliveryStatus,
    providerMessageId?: string | null,
    error?: string,
  ): Promise<void> {
    // Increment attempts atomically via raw query, then update the rest
    await this.dataSource.query(
      `UPDATE notifications.notification_deliveries
         SET status = $1,
             attempts = attempts + 1,
             last_attempt_at = NOW(),
             sent_at = CASE WHEN $1 = 'sent' THEN NOW() ELSE sent_at END,
             provider_message_id = COALESCE($2, provider_message_id),
             error = $3
       WHERE id = $4`,
      [status, providerMessageId ?? null, error ?? null, deliveryId],
    );
  }

  private mapPriority(p: string): NotificationPriority {
    const map: Record<string, NotificationPriority> = {
      low: NotificationPriority.LOW,
      normal: NotificationPriority.NORMAL,
      high: NotificationPriority.HIGH,
      critical: NotificationPriority.CRITICAL,
    };
    return map[p] ?? NotificationPriority.NORMAL;
  }

  private async resolveRecipientCredentialId(req: NotificationRequest): Promise<string | null> {
    if (req.recipientUserId) {
      return req.recipientUserId;
    }

    const assignments = await this.assignmentRepo.find({
      where: { positionId: req.recipientPositionId, vacatedAt: IsNull() },
      relations: ['user'],
      order: { assignedAt: 'DESC' },
    });

    if (!assignments.length) {
      return null;
    }

    assignments.sort((left, right) => {
      const typeDelta = ASSIGNMENT_WEIGHT[left.type] - ASSIGNMENT_WEIGHT[right.type];
      if (typeDelta !== 0) return typeDelta;
      return right.assignedAt.getTime() - left.assignedAt.getTime();
    });

    return assignments[0].user?.credentialId ?? null;
  }

  private toWebPushSubscription(subscription: PushSubscription): WebPushSubscription {
    return {
      endpoint: subscription.endpoint,
      expirationTime: subscription.expirationTime?.getTime() ?? null,
      keys: {
        p256dh: subscription.p256dhKey,
        auth: subscription.authKey,
      },
    };
  }

  private buildTelegramText(notification: Notification): string {
    const parts = [
      notification.title,
      notification.body ?? null,
      notification.actionUrl ?? null,
    ].filter((part): part is string => Boolean(part));

    return parts.join('\n\n').substring(0, 4096);
  }
}
