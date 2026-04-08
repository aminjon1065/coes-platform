import { NotificationDomainListener } from './notification-domain.listener';
import { NotificationService } from '../services/notification.service';
import { InboxService } from '../../inbox/services/inbox.service';

describe('NotificationDomainListener', () => {
  let notificationService: jest.Mocked<NotificationService>;
  let inboxService: jest.Mocked<InboxService>;
  let listener: NotificationDomainListener;

  beforeEach(() => {
    notificationService = {
      dispatch: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<NotificationService>;
    inboxService = {
      executeOnce: jest.fn().mockImplementation(async (_consumer, _eventType, _payload, handler) => {
        await handler();
        return true;
      }),
    } as unknown as jest.Mocked<InboxService>;

    listener = new NotificationDomainListener(notificationService, inboxService);
  });

  it('dispatches notification through inbox guard', async () => {
    await listener.onNotificationRequested({
      type: 'TASK_BLOCKED',
      recipientPositionId: 'pos-1',
      priority: 'high',
      payload: { taskId: 'task-1' },
    });

    expect(inboxService.executeOnce).toHaveBeenCalledWith(
      'notifications',
      'notification.requested',
      expect.objectContaining({ type: 'TASK_BLOCKED' }),
      expect.any(Function),
    );
    expect(notificationService.dispatch).toHaveBeenCalledTimes(1);
  });

  it('skips duplicate notification when inbox reports already processed', async () => {
    inboxService.executeOnce.mockResolvedValue(false);

    await listener.onNotificationRequested({
      type: 'TASK_BLOCKED',
      recipientPositionId: 'pos-1',
      priority: 'high',
      payload: { taskId: 'task-1' },
    });

    expect(notificationService.dispatch).not.toHaveBeenCalled();
  });
});
