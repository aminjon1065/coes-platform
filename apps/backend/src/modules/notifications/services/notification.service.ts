import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
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
import { EmailNotificationProvider } from '../providers/email-notification.provider';
import { SmsNotificationProvider } from '../providers/sms-notification.provider';
import { ListNotificationsDto } from '../dto/list-notifications.dto';
import { UpdatePreferenceDto } from '../dto/update-preference.dto';

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

/**
 * 2.6.1–2.6.8 — Core notification service.
 *
 * Handles:
 *  - Creating & persisting in-app notifications
 *  - Resolving delivery preferences per user/type
 *  - Throttling email delivery
 *  - Dispatching to Email and SMS providers
 *  - Delivery tracking
 *  - Read-state management
 *  - Priority-based escalation (CRITICAL bypasses throttle)
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

    private readonly emailProvider: EmailNotificationProvider,
    private readonly smsProvider: SmsNotificationProvider,
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

    // ── Create in-app notification (always) ───────────────────────────────────
    const notification = this.notifRepo.create({
      type: req.type,
      recipientPositionId: req.recipientPositionId,
      recipientUserId: req.recipientUserId ?? null,
      priority,
      title: tpl.title,
      body: tpl.body,
      actionUrl: tpl.actionUrl ?? null,
      payload: req.payload ?? null,
    });
    await this.notifRepo.save(notification);

    // ── Resolve delivery preferences ──────────────────────────────────────────
    const userId = req.recipientUserId;
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
    emailThrottleMinutes: number;
    smsMinPriority: NotificationPriority;
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
      emailThrottleMinutes: effective?.emailThrottleMinutes ?? 0,
      smsMinPriority: effective?.smsMinPriority ?? NotificationPriority.HIGH,
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
    if (dto.emailThrottleMinutes !== undefined) pref.emailThrottleMinutes = dto.emailThrottleMinutes;
    if (dto.smsMinPriority !== undefined) pref.smsMinPriority = dto.smsMinPriority;

    return this.prefRepo.save(pref);
  }

  // ─── Escalation (2.6.8) ───────────────────────────────────────────────────────

  /**
   * Re-sends a notification via a higher-priority channel if delivery failed
   * or the notification remains unread past the escalation threshold.
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

      // Re-dispatch SMS regardless of preferences
      await this.dispatchSms(notif, notif.recipientUserId);
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
}
