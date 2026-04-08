import { Repository } from 'typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InboxService } from './inbox.service';
import { InboxMessage } from '../entities/inbox-message.entity';

function makeRepo(): jest.Mocked<Repository<InboxMessage>> {
  return {
    findOne: jest.fn().mockResolvedValue(null),
    create: jest.fn((input) => ({ id: 'inbox-1', ...input }) as InboxMessage),
    save: jest.fn().mockImplementation(async (entity) => entity),
    find: jest.fn().mockResolvedValue([]),
  } as unknown as jest.Mocked<Repository<InboxMessage>>;
}

describe('InboxService', () => {
  let repo: jest.Mocked<Repository<InboxMessage>>;
  let eventEmitter: jest.Mocked<EventEmitter2>;
  let service: InboxService;

  beforeEach(() => {
    repo = makeRepo();
    eventEmitter = { emit: jest.fn() } as unknown as jest.Mocked<EventEmitter2>;
    service = new InboxService(repo, eventEmitter);
  });

  it('executes a new message once and marks it completed', async () => {
    const handler = jest.fn().mockResolvedValue(undefined);

    const processed = await service.executeOnce(
      'notifications',
      'notification.requested',
      { type: 'TASK_BLOCKED', recipientPositionId: 'pos-1' },
      handler,
    );

    expect(processed).toBe(true);
    expect(handler).toHaveBeenCalledTimes(1);
    expect(repo.save).toHaveBeenCalledWith(expect.objectContaining({ status: 'completed' }));
  });

  it('skips a message already completed', async () => {
    repo.findOne.mockResolvedValue({
      id: 'inbox-1',
      messageKey: 'existing',
      consumer: 'notifications',
      eventType: 'notification.requested',
      status: 'completed',
      attempts: 1,
      payloadHash: 'abc',
      lastError: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as InboxMessage);

    const handler = jest.fn();
    const processed = await service.executeOnce(
      'notifications',
      'notification.requested',
      { type: 'TASK_BLOCKED', recipientPositionId: 'pos-1' },
      handler,
    );

    expect(processed).toBe(false);
    expect(handler).not.toHaveBeenCalled();
  });

  it('returns operations summary for consumer state', async () => {
    repo.find = jest.fn().mockResolvedValue([
      {
        id: 'msg-1',
        messageKey: 'one',
        consumer: 'notifications',
        eventType: 'notification.requested',
        status: 'processing',
        attempts: 1,
        payloadHash: 'a',
        lastError: null,
        createdAt: new Date('2026-04-08T10:00:00.000Z'),
        updatedAt: new Date(Date.now() - 6 * 60_000),
      },
      {
        id: 'msg-2',
        messageKey: 'two',
        consumer: 'search-documents',
        eventType: 'search.document.change',
        status: 'failed',
        attempts: 2,
        payloadHash: 'b',
        lastError: 'index unavailable',
        createdAt: new Date('2026-04-08T10:01:00.000Z'),
        updatedAt: new Date('2026-04-08T10:15:00.000Z'),
      },
      {
        id: 'msg-3',
        messageKey: 'three',
        consumer: 'notifications',
        eventType: 'notification.requested',
        status: 'completed',
        attempts: 1,
        payloadHash: 'c',
        lastError: null,
        createdAt: new Date('2026-04-08T10:02:00.000Z'),
        updatedAt: new Date('2026-04-08T10:16:00.000Z'),
      },
    ] as InboxMessage[]);

    const summary = await service.getOperationsSummary();

    expect(summary.counts).toEqual({
      processing: 1,
      completed: 1,
      failed: 1,
    });
    expect(summary.consumerCount).toBe(2);
    expect(summary.staleProcessingCount).toBe(1);
    expect(summary.latestFailure).toEqual({
      id: 'msg-2',
      consumer: 'search-documents',
      eventType: 'search.document.change',
      lastError: 'index unavailable',
      updatedAt: '2026-04-08T10:15:00.000Z',
    });
  });

  it('retries an inbox message by re-emitting the stored payload', async () => {
    const message = {
      id: 'msg-2',
      messageKey: 'two',
      consumer: 'search-documents',
      eventType: 'search.document.change',
      status: 'failed',
      attempts: 2,
      payloadHash: 'b',
      payload: { entityType: 'document', id: 'doc-1' },
      lastError: 'index unavailable',
      createdAt: new Date('2026-04-08T10:01:00.000Z'),
      updatedAt: new Date('2026-04-08T10:15:00.000Z'),
    } as InboxMessage;
    repo.findOne
      .mockResolvedValueOnce(message)
      .mockResolvedValueOnce(message);

    const result = await service.retryMessage('msg-2');

    expect(eventEmitter.emit).toHaveBeenCalledWith(
      'search.document.change',
      expect.objectContaining({ entityType: 'document', id: 'doc-1' }),
    );
    expect(result.id).toBe('msg-2');
  });
});
