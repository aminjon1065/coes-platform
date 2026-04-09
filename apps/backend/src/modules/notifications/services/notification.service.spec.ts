import { NotFoundException, ForbiddenException } from '@nestjs/common';
import { Repository, DataSource, ObjectLiteral } from 'typeorm';

import { NotificationService, NotificationRequest } from './notification.service';
import { Notification, NotificationPriority } from '../entities/notification.entity';
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
import { PushNotificationProvider } from '../providers/push-notification.provider';
import { TelegramNotificationProvider } from '../providers/telegram-notification.provider';
import { UserPositionAssignment, AssignmentType } from '../../users/entities/user-position-assignment.entity';

// ── Mock helpers ───────────────────────────────────────────────────────────────

function makeThrottleQb(recentDelivery: NotificationDelivery | null = null) {
  return {
    innerJoin: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    getOne: jest.fn().mockResolvedValue(recentDelivery),
  };
}

function mockRepo<T extends ObjectLiteral>(
  throttleQb = makeThrottleQb(),
): jest.Mocked<Repository<T>> {
  return {
    create: jest.fn((dto: Partial<T>) => ({ id: 'generated-id', ...dto }) as unknown as T),
    save: jest.fn().mockImplementation(async (entity: T) => entity),
    find: jest.fn().mockResolvedValue([]),
    findOne: jest.fn().mockResolvedValue(null),
    update: jest.fn().mockResolvedValue({ affected: 1 }),
    delete: jest.fn().mockResolvedValue({ affected: 1 }),
    count: jest.fn().mockResolvedValue(0),
    createQueryBuilder: jest.fn().mockReturnValue(throttleQb),
  } as unknown as jest.Mocked<Repository<T>>;
}

function makeNotification(overrides: Partial<Notification> = {}): Notification {
  return {
    id: 'notif-1',
    type: 'TASK_OVERDUE_EXECUTOR',
    recipientPositionId: 'pos-1',
    recipientUserId: 'user-1',
    priority: NotificationPriority.NORMAL,
    title: 'Your task is overdue',
    body: 'Task "Flood survey" has passed its deadline.',
    actionUrl: '/tasks/task-1',
    payload: null,
    isRead: false,
    readAt: null,
    expiresAt: null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  } as Notification;
}

function makeDelivery(overrides: Partial<NotificationDelivery> = {}): NotificationDelivery {
  return {
    id: 'del-1',
    notificationId: 'notif-1',
    channel: DeliveryChannel.EMAIL,
    status: DeliveryStatus.PENDING,
    attempts: 0,
    lastAttemptAt: null,
    sentAt: null,
    providerMessageId: null,
    error: null,
    createdAt: new Date(),
    ...overrides,
  } as NotificationDelivery;
}

function makePreference(overrides: Partial<NotificationPreference> = {}): NotificationPreference {
  return {
    id: 'pref-1',
    userId: 'user-1',
    notificationType: null,
    inApp: true,
    email: true,
    sms: false,
    telegram: false,
    push: true,
    emailThrottleMinutes: 0,
    smsMinPriority: NotificationPriority.HIGH,
    telegramMinPriority: NotificationPriority.HIGH,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as NotificationPreference;
}

function makePushSubscription(overrides: Partial<PushSubscription> = {}): PushSubscription {
  return {
    id: 'push-1',
    userId: 'user-1',
    endpoint: 'https://push.example.test/subscription/1',
    p256dhKey: 'p256dh-key',
    authKey: 'auth-key',
    expirationTime: null,
    userAgent: 'Field PWA',
    status: PushSubscriptionStatus.ACTIVE,
    failureCount: 0,
    lastSuccessAt: null,
    lastFailureAt: null,
    lastFailureReason: null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  } as PushSubscription;
}

function makeTelegramSubscription(
  overrides: Partial<TelegramSubscription> = {},
): TelegramSubscription {
  return {
    id: 'tg-1',
    userId: 'user-1',
    chatId: '123456789',
    username: 'coescd_user',
    displayName: 'CoES User',
    status: TelegramSubscriptionStatus.ACTIVE,
    lastSuccessAt: null,
    lastFailureAt: null,
    lastFailureReason: null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  } as TelegramSubscription;
}

function makeAssignment(overrides: Partial<UserPositionAssignment> = {}): UserPositionAssignment {
  return {
    id: 'assignment-1',
    userId: 'profile-1',
    user: {
      id: 'profile-1',
      credentialId: 'user-1',
      email: 'user@coescd.tj',
      phone: '+992501234567',
      status: 'active',
    } as any,
    positionId: 'pos-1',
    type: AssignmentType.PRIMARY,
    assignedAt: new Date('2026-01-01T00:00:00Z'),
    vacatedAt: null,
    assignedById: null,
    vacatedById: null,
    notes: null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  } as UserPositionAssignment;
}

// ── Test suite ─────────────────────────────────────────────────────────────────

describe('NotificationService', () => {
  let service: NotificationService;
  let notifRepo: jest.Mocked<Repository<Notification>>;
  let prefRepo: jest.Mocked<Repository<NotificationPreference>>;
  let deliveryRepo: jest.Mocked<Repository<NotificationDelivery>>;
  let pushSubscriptionRepo: jest.Mocked<Repository<PushSubscription>>;
  let telegramSubscriptionRepo: jest.Mocked<Repository<TelegramSubscription>>;
  let assignmentRepo: jest.Mocked<Repository<UserPositionAssignment>>;
  let emailProvider: jest.Mocked<Pick<EmailNotificationProvider, 'resolveEmailAddress' | 'send'>>;
  let smsProvider: jest.Mocked<Pick<SmsNotificationProvider, 'resolvePhoneNumber' | 'send'>>;
  let pushProvider: jest.Mocked<Pick<PushNotificationProvider, 'isEnabled' | 'send'>>;
  let telegramProvider: jest.Mocked<Pick<TelegramNotificationProvider, 'isEnabled' | 'send'>>;
  let dataSource: { query: jest.Mock };
  let cacheManager: { get: jest.Mock; set: jest.Mock; del: jest.Mock };
  let configService: { get: jest.Mock };

  beforeEach(() => {
    notifRepo    = mockRepo<Notification>();
    prefRepo     = mockRepo<NotificationPreference>();
    deliveryRepo = mockRepo<NotificationDelivery>();
    pushSubscriptionRepo = mockRepo<PushSubscription>();
    telegramSubscriptionRepo = mockRepo<TelegramSubscription>();
    assignmentRepo = mockRepo<UserPositionAssignment>();

    emailProvider = {
      resolveEmailAddress: jest.fn().mockResolvedValue('user@coescd.tj'),
      send: jest.fn().mockResolvedValue({ success: true, messageId: 'msg-1' }),
    };
    smsProvider = {
      resolvePhoneNumber: jest.fn().mockResolvedValue('+992501234567'),
      send: jest.fn().mockResolvedValue({ success: true, messageId: 'sms-1' }),
    };
    pushProvider = {
      isEnabled: jest.fn().mockReturnValue(true),
      send: jest.fn().mockResolvedValue({ success: true, statusCode: 201 }),
    };
    telegramProvider = {
      isEnabled: jest.fn().mockReturnValue(true),
      send: jest.fn().mockResolvedValue({ success: true, messageId: 'tg-msg-1' }),
    };
    dataSource = { query: jest.fn().mockResolvedValue(undefined) };
    cacheManager = {
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue(undefined),
      del: jest.fn().mockResolvedValue(undefined),
    };
    configService = {
      get: jest.fn().mockImplementation((_key: string, fallback?: unknown) => fallback),
    };

    service = new NotificationService(
      notifRepo    as any,
      prefRepo     as any,
      deliveryRepo as any,
      pushSubscriptionRepo as any,
      telegramSubscriptionRepo as any,
      assignmentRepo as any,
      emailProvider as any,
      smsProvider   as any,
      pushProvider  as any,
      telegramProvider as any,
      dataSource    as unknown as DataSource,
      cacheManager  as any,
      configService as any,
    );
  });

  // ── dispatch ──────────────────────────────────────────────────────────────────

  describe('dispatch', () => {
    it('creates in-app only delivery when no recipientUserId', async () => {
      assignmentRepo.find.mockResolvedValue([]);

      const req: NotificationRequest = {
        type: 'TASK_OVERDUE_EXECUTOR',
        recipientPositionId: 'pos-1',
        payload: { taskTitle: 'Flood survey', taskId: 'task-1', deadline: '2026-01-15' },
      };

      await service.dispatch(req);

      expect(notifRepo.save).toHaveBeenCalledTimes(1);
      const deliveryCalls = deliveryRepo.create.mock.calls.map((c) => c[0] as Partial<NotificationDelivery>);
      expect(deliveryCalls).toHaveLength(1);
      expect(deliveryCalls[0].channel).toBe(DeliveryChannel.IN_APP);
      expect(deliveryCalls[0].status).toBe(DeliveryStatus.SENT);
      // email provider must NOT be called
      expect(emailProvider.send).not.toHaveBeenCalled();
    });

    it('resolves recipient credential from active position assignment when recipientUserId is omitted', async () => {
      assignmentRepo.find.mockResolvedValue([makeAssignment()]);
      prefRepo.find.mockResolvedValue([makePreference({ email: true, sms: false })]);

      await service.dispatch({
        type: 'TASK_OVERDUE_EXECUTOR',
        recipientPositionId: 'pos-1',
        payload: { taskTitle: 'Survey', taskId: 't-1' },
      });

      const created = notifRepo.create.mock.calls[0][0] as Partial<Notification>;
      expect(created.recipientUserId).toBe('user-1');
      expect(emailProvider.resolveEmailAddress).toHaveBeenCalledWith('user-1');
    });

    it('maps notification type to correct template title', async () => {
      await service.dispatch({
        type: 'TASK_AWAITING_VERIFICATION',
        recipientPositionId: 'pos-1',
        payload: { taskTitle: 'Bridge inspection', taskId: 't-2' },
      });

      const created = notifRepo.create.mock.calls[0][0] as Partial<Notification>;
      expect(created.title).toBe('Task awaiting your verification');
    });

    it('falls back to DEFAULT_TEMPLATE for unknown notification types', async () => {
      await service.dispatch({
        type: 'UNKNOWN_EVENT',
        recipientPositionId: 'pos-1',
        payload: { foo: 'bar' },
      });

      const created = notifRepo.create.mock.calls[0][0] as Partial<Notification>;
      expect(created.title).toBe('Notification: UNKNOWN_EVENT');
    });

    it('maps priority string to enum (low → LOW)', async () => {
      await service.dispatch({
        type: 'TASK_OVERDUE_EXECUTOR',
        recipientPositionId: 'pos-1',
        priority: 'low',
      });

      const created = notifRepo.create.mock.calls[0][0] as Partial<Notification>;
      expect(created.priority).toBe(NotificationPriority.LOW);
    });

    it('defaults priority to NORMAL when not provided', async () => {
      await service.dispatch({ type: 'TASK_OVERDUE_EXECUTOR', recipientPositionId: 'pos-1' });

      const created = notifRepo.create.mock.calls[0][0] as Partial<Notification>;
      expect(created.priority).toBe(NotificationPriority.NORMAL);
    });

    it('routes email + in-app when userId present and prefs.email=true', async () => {
      prefRepo.find.mockResolvedValue([makePreference({ email: true, sms: false })]);

      await service.dispatch({
        type: 'TASK_OVERDUE_EXECUTOR',
        recipientPositionId: 'pos-1',
        recipientUserId: 'user-1',
        payload: { taskTitle: 'Survey', taskId: 't-1' },
      });

      const channels = deliveryRepo.create.mock.calls.map(
        (c) => (c[0] as Partial<NotificationDelivery>).channel,
      );
      expect(channels).toContain(DeliveryChannel.IN_APP);
      expect(channels).toContain(DeliveryChannel.EMAIL);
      expect(channels).toContain(DeliveryChannel.PUSH);
      expect(emailProvider.send).toHaveBeenCalledTimes(1);
    });

    it('skips email delivery (SKIPPED) when prefs.email=false', async () => {
      prefRepo.find.mockResolvedValue([makePreference({ email: false, sms: false })]);

      await service.dispatch({
        type: 'TASK_OVERDUE_EXECUTOR',
        recipientPositionId: 'pos-1',
        recipientUserId: 'user-1',
        payload: { taskTitle: 'Survey', taskId: 't-1' },
      });

      const deliveries = deliveryRepo.create.mock.calls.map(
        (c) => c[0] as Partial<NotificationDelivery>,
      );
      const emailDelivery = deliveries.find((d) => d.channel === DeliveryChannel.EMAIL);
      expect(emailDelivery?.status).toBe(DeliveryStatus.SKIPPED);
      expect(emailProvider.send).not.toHaveBeenCalled();
    });

    it('routes SMS when prefs.sms=true and priority meets smsMinPriority', async () => {
      prefRepo.find.mockResolvedValue([
        makePreference({ sms: true, smsMinPriority: NotificationPriority.HIGH }),
      ]);

      await service.dispatch({
        type: 'TASK_OVERDUE_EXECUTOR',
        recipientPositionId: 'pos-1',
        recipientUserId: 'user-1',
        priority: 'high',
        payload: { taskTitle: 'Survey', taskId: 't-1' },
      });

      expect(smsProvider.send).toHaveBeenCalledTimes(1);
    });

    it('skips SMS when priority is below smsMinPriority', async () => {
      prefRepo.find.mockResolvedValue([
        makePreference({ sms: true, smsMinPriority: NotificationPriority.HIGH }),
      ]);

      await service.dispatch({
        type: 'TASK_OVERDUE_EXECUTOR',
        recipientPositionId: 'pos-1',
        recipientUserId: 'user-1',
        priority: 'normal',  // NORMAL < HIGH
        payload: { taskTitle: 'Survey', taskId: 't-1' },
      });

      const deliveries = deliveryRepo.create.mock.calls.map(
        (c) => c[0] as Partial<NotificationDelivery>,
      );
      const smsDelivery = deliveries.find((d) => d.channel === DeliveryChannel.SMS);
      expect(smsDelivery?.status).toBe(DeliveryStatus.SKIPPED);
      expect(smsProvider.send).not.toHaveBeenCalled();
    });

    it('CRITICAL bypasses smsMinPriority filter and always sends SMS', async () => {
      prefRepo.find.mockResolvedValue([
        makePreference({ sms: true, smsMinPriority: NotificationPriority.HIGH }),
      ]);

      await service.dispatch({
        type: 'TASK_OVERDUE_EXECUTOR',
        recipientPositionId: 'pos-1',
        recipientUserId: 'user-1',
        priority: 'critical',
        payload: { taskTitle: 'Critical flood risk', taskId: 't-3' },
      });

      expect(smsProvider.send).toHaveBeenCalledTimes(1);
    });

    it('sends web push to active subscriptions when push preferences are enabled', async () => {
      prefRepo.find.mockResolvedValue([makePreference({ push: true, email: false, sms: false })]);
      pushSubscriptionRepo.find.mockResolvedValue([makePushSubscription()]);

      await service.dispatch({
        type: 'TASK_OVERDUE_EXECUTOR',
        recipientPositionId: 'pos-1',
        recipientUserId: 'user-1',
        payload: { taskTitle: 'Survey', taskId: 't-1' },
      });

      expect(pushProvider.send).toHaveBeenCalledTimes(1);
      expect(pushSubscriptionRepo.update).toHaveBeenCalledWith(
        'push-1',
        expect.objectContaining({
          status: PushSubscriptionStatus.ACTIVE,
          failureCount: 0,
          lastSuccessAt: expect.any(Date),
        }),
      );
    });

    it('marks push delivery as skipped when no active subscriptions exist', async () => {
      prefRepo.find.mockResolvedValue([makePreference({ push: true, email: false, sms: false })]);
      pushSubscriptionRepo.find.mockResolvedValue([]);

      await service.dispatch({
        type: 'TASK_OVERDUE_EXECUTOR',
        recipientPositionId: 'pos-1',
        recipientUserId: 'user-1',
        payload: { taskTitle: 'Survey', taskId: 't-1' },
      });

      expect(dataSource.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE'),
        expect.arrayContaining(['skipped', null, 'no active push subscriptions']),
      );
      expect(pushProvider.send).not.toHaveBeenCalled();
    });
  });

  // ── email throttle ─────────────────────────────────────────────────────────────

  describe('email throttle (via dispatch)', () => {
    const baseReq: NotificationRequest = {
      type: 'TASK_OVERDUE_EXECUTOR',
      recipientPositionId: 'pos-1',
      recipientUserId: 'user-1',
      priority: 'normal',
      payload: { taskTitle: 'Survey', taskId: 't-1' },
    };

    it('throttles email when recent SENT delivery exists within window', async () => {
      const throttleQb = makeThrottleQb(makeDelivery({ status: DeliveryStatus.SENT }));
      deliveryRepo.createQueryBuilder.mockReturnValue(throttleQb as any);

      prefRepo.find.mockResolvedValue([makePreference({ emailThrottleMinutes: 60 })]);

      await service.dispatch(baseReq);

      // dataSource.query called with 'skipped' status
      expect(dataSource.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE'),
        expect.arrayContaining(['skipped']),
      );
      expect(emailProvider.send).not.toHaveBeenCalled();
    });

    it('CRITICAL bypasses email throttle even if recent delivery exists', async () => {
      const throttleQb = makeThrottleQb(makeDelivery({ status: DeliveryStatus.SENT }));
      deliveryRepo.createQueryBuilder.mockReturnValue(throttleQb as any);

      prefRepo.find.mockResolvedValue([makePreference({ emailThrottleMinutes: 60 })]);

      await service.dispatch({ ...baseReq, priority: 'critical' });

      expect(emailProvider.send).toHaveBeenCalledTimes(1);
    });

    it('does not throttle when throttleMinutes=0', async () => {
      prefRepo.find.mockResolvedValue([makePreference({ emailThrottleMinutes: 0 })]);

      await service.dispatch(baseReq);

      // throttle query builder should not have been invoked
      expect(emailProvider.send).toHaveBeenCalledTimes(1);
    });
  });

  // ── email address / provider outcome ─────────────────────────────────────────

  describe('email provider outcome (via dispatch)', () => {
    const baseReq: NotificationRequest = {
      type: 'TASK_OVERDUE_EXECUTOR',
      recipientPositionId: 'pos-1',
      recipientUserId: 'user-1',
      payload: { taskTitle: 'Survey', taskId: 't-1' },
    };

    beforeEach(() => {
      prefRepo.find.mockResolvedValue([makePreference({ email: true, sms: false })]);
    });

    it('marks delivery SKIPPED when no email address on file', async () => {
      emailProvider.resolveEmailAddress.mockResolvedValue(null as any);

      await service.dispatch(baseReq);

      expect(dataSource.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE'),
        expect.arrayContaining(['skipped']),
      );
    });

    it('marks delivery SENT when provider returns success', async () => {
      emailProvider.send.mockResolvedValue({ success: true, messageId: 'ext-123' });

      await service.dispatch(baseReq);

      expect(dataSource.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE'),
        expect.arrayContaining(['sent']),
      );
    });

    it('marks delivery FAILED when provider returns success=false', async () => {
      emailProvider.send.mockResolvedValue({ success: false, error: 'SMTP timeout' });

      await service.dispatch(baseReq);

      expect(dataSource.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE'),
        expect.arrayContaining(['failed']),
      );
    });

    it('marks delivery FAILED when provider throws', async () => {
      emailProvider.send.mockRejectedValue(new Error('Connection refused'));

      await service.dispatch(baseReq);

      expect(dataSource.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE'),
        expect.arrayContaining(['failed']),
      );
    });

    it('sends Telegram when prefs.telegram=true and priority meets telegramMinPriority', async () => {
      prefRepo.find.mockResolvedValue([
        makePreference({ telegram: true, telegramMinPriority: NotificationPriority.HIGH, email: false, push: false }),
      ]);
      telegramSubscriptionRepo.findOne.mockResolvedValue(makeTelegramSubscription());

      await service.dispatch({
        type: 'TASK_OVERDUE_EXECUTOR',
        recipientPositionId: 'pos-1',
        recipientUserId: 'user-1',
        priority: 'high',
        payload: { taskTitle: 'Survey', taskId: 't-1' },
      });

      expect(telegramProvider.send).toHaveBeenCalledTimes(1);
      expect(telegramSubscriptionRepo.update).toHaveBeenCalledWith(
        'tg-1',
        expect.objectContaining({
          status: TelegramSubscriptionStatus.ACTIVE,
          lastSuccessAt: expect.any(Date),
        }),
      );
    });
  });

  // ── SMS provider outcome ───────────────────────────────────────────────────────

  describe('SMS provider outcome (via dispatch)', () => {
    const baseReq: NotificationRequest = {
      type: 'TASK_OVERDUE_EXECUTOR',
      recipientPositionId: 'pos-1',
      recipientUserId: 'user-1',
      priority: 'critical',
      payload: { taskTitle: 'Survey', taskId: 't-1' },
    };

    beforeEach(() => {
      prefRepo.find.mockResolvedValue([makePreference({ sms: true, email: false })]);
    });

    it('marks SMS delivery SKIPPED when no phone number on file', async () => {
      smsProvider.resolvePhoneNumber.mockResolvedValue(null as any);

      await service.dispatch(baseReq);

      expect(dataSource.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE'),
        expect.arrayContaining(['skipped']),
      );
      expect(smsProvider.send).not.toHaveBeenCalled();
    });

    it('marks SMS delivery SENT when provider returns success', async () => {
      await service.dispatch(baseReq);

      expect(dataSource.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE'),
        expect.arrayContaining(['sent']),
      );
    });

    it('marks SMS delivery FAILED when provider returns success=false', async () => {
      smsProvider.send.mockResolvedValue({ success: false, error: 'carrier rejected' });

      await service.dispatch(baseReq);

      expect(dataSource.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE'),
        expect.arrayContaining(['failed']),
      );
    });
  });

  // ── resolvePreferences ─────────────────────────────────────────────────────────

  describe('resolvePreferences', () => {
    it('returns hardcoded defaults when no preference rows exist', async () => {
      prefRepo.find.mockResolvedValue([]);

      const prefs = await service.resolvePreferences('user-1', 'TASK_OVERDUE_EXECUTOR');

      expect(prefs.inApp).toBe(true);
      expect(prefs.email).toBe(true);
      expect(prefs.sms).toBe(false);
      expect(prefs.telegram).toBe(false);
      expect(prefs.push).toBe(true);
      expect(prefs.emailThrottleMinutes).toBe(0);
      expect(prefs.smsMinPriority).toBe(NotificationPriority.HIGH);
      expect(prefs.telegramMinPriority).toBe(NotificationPriority.HIGH);
    });

    it('uses default (null type) row when no specific override', async () => {
      prefRepo.find.mockResolvedValue([
        makePreference({ notificationType: null, sms: true, emailThrottleMinutes: 30 }),
      ]);

      const prefs = await service.resolvePreferences('user-1', 'TASK_OVERDUE_EXECUTOR');

      expect(prefs.sms).toBe(true);
      expect(prefs.telegram).toBe(false);
      expect(prefs.push).toBe(true);
      expect(prefs.emailThrottleMinutes).toBe(30);
    });

    it('specific-type row overrides the default row', async () => {
      prefRepo.find.mockResolvedValue([
        makePreference({ notificationType: null, email: true, sms: false }),
        makePreference({ id: 'pref-2', notificationType: 'TASK_OVERDUE_EXECUTOR', email: false, sms: true }),
      ]);

      const prefs = await service.resolvePreferences('user-1', 'TASK_OVERDUE_EXECUTOR');

      expect(prefs.email).toBe(false);
      expect(prefs.sms).toBe(true);
    });
  });

  describe('telegram subscriptions', () => {
    it('upserts the current user telegram binding', async () => {
      telegramSubscriptionRepo.findOne
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(makeTelegramSubscription({ userId: 'user-1' }));

      const result = await service.registerTelegramSubscription('user-1', {
        chatId: '987654321',
        username: 'field_user',
        displayName: 'Field User',
      });

      expect(telegramSubscriptionRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user-1',
          chatId: '987654321',
          username: 'field_user',
          displayName: 'Field User',
          status: TelegramSubscriptionStatus.ACTIVE,
        }),
      );
      expect(result.chatId).toBe('987654321');
    });

    it('marks the current user telegram binding as revoked on delete', async () => {
      telegramSubscriptionRepo.findOne.mockResolvedValue(makeTelegramSubscription());

      await service.removeTelegramSubscription('user-1');

      expect(telegramSubscriptionRepo.update).toHaveBeenCalledWith(
        'tg-1',
        expect.objectContaining({ status: TelegramSubscriptionStatus.REVOKED }),
      );
    });
  });

  // ── push subscriptions ────────────────────────────────────────────────────────

  describe('push subscriptions', () => {
    it('upserts an existing endpoint for the current user', async () => {
      pushSubscriptionRepo.findOne.mockResolvedValue(makePushSubscription({ userId: 'user-2' }));

      const result = await service.registerPushSubscription(
        'user-1',
        {
          endpoint: 'https://push.example.test/subscription/1',
          expirationTime: 1767225600000,
          keys: { p256dh: 'new-p256dh', auth: 'new-auth' },
        },
        'Field PWA 1.0',
      );

      expect(pushSubscriptionRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user-1',
          endpoint: 'https://push.example.test/subscription/1',
          p256dhKey: 'new-p256dh',
          authKey: 'new-auth',
          status: PushSubscriptionStatus.ACTIVE,
          failureCount: 0,
          userAgent: 'Field PWA 1.0',
        }),
      );
      expect(result.userId).toBe('user-1');
    });

    it('deletes a push subscription by userId and endpoint', async () => {
      await service.removePushSubscription('user-1', 'https://push.example.test/subscription/1');

      expect(pushSubscriptionRepo.delete).toHaveBeenCalledWith({
        userId: 'user-1',
        endpoint: 'https://push.example.test/subscription/1',
      });
    });
  });

  // ── markRead ───────────────────────────────────────────────────────────────────

  describe('markRead', () => {
    it('throws NotFoundException when notification does not exist', async () => {
      notifRepo.findOne.mockResolvedValue(null);

      await expect(service.markRead('notif-x', 'user-1', 'pos-1')).rejects.toThrow(NotFoundException);
    });

    it('throws ForbiddenException when notification belongs to another user', async () => {
      notifRepo.findOne.mockResolvedValue(
        makeNotification({ recipientUserId: 'user-2', recipientPositionId: 'pos-2' }),
      );

      await expect(service.markRead('notif-1', 'user-1', 'pos-1')).rejects.toThrow(ForbiddenException);
    });

    it('marks notification as read and sets readAt', async () => {
      notifRepo.findOne.mockResolvedValue(makeNotification({ isRead: false }));

      await service.markRead('notif-1', 'user-1', 'pos-1');

      expect(notifRepo.update).toHaveBeenCalledWith(
        'notif-1',
        expect.objectContaining({ isRead: true, readAt: expect.any(Date) }),
      );
    });

    it('marks a position-scoped notification as read for the active position occupant', async () => {
      notifRepo.findOne.mockResolvedValue(
        makeNotification({ recipientUserId: null as any, recipientPositionId: 'pos-1', isRead: false }),
      );

      await service.markRead('notif-1', 'user-1', 'pos-1');

      expect(notifRepo.update).toHaveBeenCalledWith(
        'notif-1',
        expect.objectContaining({ isRead: true, readAt: expect.any(Date) }),
      );
    });

    it('is idempotent — does not update when already read', async () => {
      notifRepo.findOne.mockResolvedValue(makeNotification({ isRead: true }));

      await service.markRead('notif-1', 'user-1', 'pos-1');

      expect(notifRepo.update).not.toHaveBeenCalled();
    });
  });

  // ── escalateUnreadCritical ─────────────────────────────────────────────────────

  it('does not update expired notifications hidden from inbox', async () => {
    notifRepo.findOne.mockResolvedValue(
      makeNotification({ isRead: false, expiresAt: new Date(Date.now() - 60_000) }),
    );

    await service.markRead('notif-1', 'user-1', 'pos-1');

    expect(notifRepo.update).not.toHaveBeenCalled();
  });

  describe('markAllRead', () => {
    it('updates only unread non-expired notifications for user or active position', async () => {
      dataSource.query.mockResolvedValue([{ id: 'notif-1' }, { id: 'notif-2' }]);

      const result = await service.markAllRead('user-1', 'pos-1');

      expect(dataSource.query).toHaveBeenCalledWith(
        expect.stringContaining('AND (expires_at IS NULL OR expires_at > NOW())'),
        ['user-1', 'pos-1'],
      );
      expect(result).toEqual({ updated: 2 });
    });
  });

  describe('escalateUnreadCritical', () => {
    it('re-dispatches Telegram for old CRITICAL unread notifications before SMS fallback', async () => {
      const oldCritical = makeNotification({
        priority: NotificationPriority.CRITICAL,
        isRead: false,
        recipientUserId: 'user-1',
        createdAt: new Date(Date.now() - 31 * 60_000),  // 31 minutes ago
      });
      notifRepo.find.mockResolvedValue([oldCritical]);
      telegramSubscriptionRepo.findOne.mockResolvedValue(makeTelegramSubscription());

      await service.escalateUnreadCritical();

      expect(telegramProvider.send).toHaveBeenCalledTimes(1);
      expect(smsProvider.send).not.toHaveBeenCalled();
    });

    it('skips notifications created less than 30 minutes ago', async () => {
      const recentCritical = makeNotification({
        priority: NotificationPriority.CRITICAL,
        isRead: false,
        recipientUserId: 'user-1',
        createdAt: new Date(Date.now() - 5 * 60_000),  // 5 min ago
      });
      notifRepo.find.mockResolvedValue([recentCritical]);

      await service.escalateUnreadCritical();

      expect(smsProvider.send).not.toHaveBeenCalled();
    });

    it('skips notifications without a recipientUserId (system/broadcast)', async () => {
      const positionOnly = makeNotification({
        priority: NotificationPriority.CRITICAL,
        isRead: false,
        recipientUserId: null as any,
        createdAt: new Date(Date.now() - 60 * 60_000),
      });
      notifRepo.find.mockResolvedValue([positionOnly]);

      await service.escalateUnreadCritical();

      expect(smsProvider.send).not.toHaveBeenCalled();
    });
  });
});
