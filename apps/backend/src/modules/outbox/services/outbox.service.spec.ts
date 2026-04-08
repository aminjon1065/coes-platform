import { Repository } from 'typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { OutboxService } from './outbox.service';
import { OutboxEvent } from '../entities/outbox-event.entity';

function makeRepo(): jest.Mocked<Repository<OutboxEvent>> {
  const qb = {
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    getMany: jest.fn().mockResolvedValue([]),
  };

  return {
    create: jest.fn((input) => ({ id: 'outbox-1', attempts: 0, maxAttempts: 10, ...input }) as OutboxEvent),
    save: jest.fn().mockImplementation(async (entity) => entity),
    findOne: jest.fn().mockResolvedValue(null),
    find: jest.fn().mockResolvedValue([]),
    createQueryBuilder: jest.fn().mockReturnValue(qb),
  } as unknown as jest.Mocked<Repository<OutboxEvent>>;
}

describe('OutboxService', () => {
  let repo: jest.Mocked<Repository<OutboxEvent>>;
  let eventEmitter: jest.Mocked<EventEmitter2>;
  let service: OutboxService;

  beforeEach(() => {
    repo = makeRepo();
    eventEmitter = { emit: jest.fn() } as unknown as jest.Mocked<EventEmitter2>;
    service = new OutboxService(repo, eventEmitter);
  });

  it('persists and dispatches an outbox event immediately', async () => {
    const result = await service.publish(
      'notification.requested',
      { type: 'TASK_OVERDUE', recipientPositionId: 'pos-1' },
      { source: 'tasks' },
    );

    expect(repo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'notification.requested',
        source: 'tasks',
      }),
    );
    expect(eventEmitter.emit).toHaveBeenCalledWith(
      'notification.requested',
      expect.objectContaining({ type: 'TASK_OVERDUE' }),
    );
    expect(result.status).toBe('dispatched');
    expect(result.attempts).toBe(1);
  });

  it('marks an event as failed when immediate dispatch throws', async () => {
    eventEmitter.emit.mockImplementation(() => {
      throw new Error('listener crashed');
    });

    const result = await service.publish('edms.resolution_issued', { documentId: 'doc-1' });

    expect(result.status).toBe('failed');
    expect(result.lastError).toContain('listener crashed');
    expect(result.availableAt).toBeInstanceOf(Date);
  });

  it('returns operations summary for dispatch backlog', async () => {
    repo.find = jest.fn().mockResolvedValue([
      {
        id: 'evt-1',
        eventType: 'task.channel_requested',
        status: 'pending',
        source: 'tasks',
        attempts: 0,
        maxAttempts: 10,
        availableAt: new Date('2026-04-08T10:10:00.000Z'),
        createdAt: new Date('2026-04-08T10:00:00.000Z'),
        updatedAt: new Date('2026-04-08T10:00:00.000Z'),
      },
      {
        id: 'evt-2',
        eventType: 'notification.requested',
        status: 'failed',
        source: 'tasks',
        attempts: 2,
        maxAttempts: 10,
        lastError: 'bus timeout',
        availableAt: new Date('2026-04-08T10:12:00.000Z'),
        createdAt: new Date('2026-04-08T10:01:00.000Z'),
        updatedAt: new Date('2026-04-08T10:11:00.000Z'),
      },
      {
        id: 'evt-3',
        eventType: 'edms.resolution_issued',
        status: 'dead_letter',
        source: 'edms',
        attempts: 10,
        maxAttempts: 10,
        lastError: 'dead',
        availableAt: new Date('2026-04-08T10:15:00.000Z'),
        createdAt: new Date('2026-04-08T10:02:00.000Z'),
        updatedAt: new Date('2026-04-08T10:12:00.000Z'),
      },
    ] as OutboxEvent[]);

    const summary = await service.getOperationsSummary();

    expect(summary.counts).toEqual({
      pending: 1,
      dispatched: 0,
      failed: 1,
      deadLetter: 1,
    });
    expect(summary.retryableCount).toBe(2);
    expect(summary.oldestPendingAt).toBe('2026-04-08T10:00:00.000Z');
    expect(summary.nextRetryAt).toBe('2026-04-08T10:10:00.000Z');
    expect(summary.latestFailure).toEqual({
      id: 'evt-3',
      eventType: 'edms.resolution_issued',
      source: 'edms',
      lastError: 'dead',
      updatedAt: '2026-04-08T10:12:00.000Z',
    });
  });

  it('replays a stored outbox event by id', async () => {
    repo.findOne.mockResolvedValue({
      id: 'evt-1',
      eventType: 'notification.requested',
      payload: { type: 'TASK_BLOCKED' },
      status: 'failed',
      source: 'tasks',
      aggregateType: null,
      aggregateId: null,
      attempts: 4,
      maxAttempts: 10,
      availableAt: new Date('2026-04-08T10:00:00.000Z'),
      lastAttemptAt: null,
      dispatchedAt: null,
      lastError: 'broken',
      createdAt: new Date('2026-04-08T09:59:00.000Z'),
      updatedAt: new Date('2026-04-08T10:01:00.000Z'),
    } as OutboxEvent);

    const result = await service.replayEvent('evt-1');

    expect(eventEmitter.emit).toHaveBeenCalledWith(
      'notification.requested',
      expect.objectContaining({ type: 'TASK_BLOCKED' }),
    );
    expect(result.status).toBe('dispatched');
    expect(result.attempts).toBe(1);
  });
});
