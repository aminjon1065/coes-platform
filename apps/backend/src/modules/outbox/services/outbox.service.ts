import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { OutboxEvent } from '../entities/outbox-event.entity';

type PublishOptions = {
  source?: string;
  aggregateType?: string;
  aggregateId?: string;
  maxAttempts?: number;
};

type OutboxStatusCounts = {
  pending: number;
  dispatched: number;
  failed: number;
  deadLetter: number;
};

export type OutboxOperationsSummary = {
  counts: OutboxStatusCounts;
  retryableCount: number;
  oldestPendingAt: string | null;
  nextRetryAt: string | null;
  latestFailure: {
    id: string;
    eventType: string;
    source: string | null;
    lastError: string | null;
    updatedAt: string;
  } | null;
};

export type OutboxBacklogItem = {
  id: string;
  eventType: string;
  source: string | null;
  status: 'pending' | 'dispatched' | 'failed' | 'dead_letter';
  attempts: number;
  maxAttempts: number;
  availableAt: string;
  lastError: string | null;
  updatedAt: string;
};

@Injectable()
export class OutboxService {
  private readonly logger = new Logger(OutboxService.name);

  constructor(
    @InjectRepository(OutboxEvent)
    private readonly outboxRepo: Repository<OutboxEvent>,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async publish(
    eventType: string,
    payload: Record<string, unknown>,
    options: PublishOptions = {},
  ): Promise<OutboxEvent> {
    const event = this.outboxRepo.create({
      eventType,
      payload,
      status: 'pending',
      source: options.source ?? null,
      aggregateType: options.aggregateType ?? null,
      aggregateId: options.aggregateId ?? null,
      maxAttempts: options.maxAttempts ?? 10,
      availableAt: new Date(),
    });

    await this.outboxRepo.save(event);
    return this.dispatchStoredEvent(event);
  }

  @Cron('*/15 * * * * *')
  async dispatchPendingBatch(): Promise<void> {
    const pending = await this.outboxRepo
      .createQueryBuilder('outbox')
      .where('outbox.status IN (:...statuses)', { statuses: ['pending', 'failed'] })
      .andWhere('outbox.available_at <= NOW()')
      .andWhere('outbox.attempts < outbox.max_attempts')
      .orderBy('outbox.created_at', 'ASC')
      .limit(50)
      .getMany();

    for (const event of pending) {
      await this.dispatchStoredEvent(event);
    }
  }

  async getOperationsSummary(): Promise<OutboxOperationsSummary> {
    const events = await this.outboxRepo.find({
      order: {
        createdAt: 'ASC',
      },
    });

    const counts = events.reduce<OutboxStatusCounts>(
      (summary, event) => {
        if (event.status === 'pending') {
          summary.pending += 1;
        } else if (event.status === 'dispatched') {
          summary.dispatched += 1;
        } else if (event.status === 'failed') {
          summary.failed += 1;
        } else if (event.status === 'dead_letter') {
          summary.deadLetter += 1;
        }

        return summary;
      },
      {
        pending: 0,
        dispatched: 0,
        failed: 0,
        deadLetter: 0,
      },
    );

    const retryableEvents = events.filter(
      (event) =>
        (event.status === 'pending' || event.status === 'failed') &&
        event.attempts < event.maxAttempts,
    );
    const pendingEvents = events.filter((event) => event.status === 'pending');
    const latestFailure = [...events]
      .filter((event) => event.status === 'failed' || event.status === 'dead_letter')
      .sort((left, right) => right.updatedAt.getTime() - left.updatedAt.getTime())[0];
    const nextRetry = [...retryableEvents].sort(
      (left, right) => left.availableAt.getTime() - right.availableAt.getTime(),
    )[0];
    const oldestPending = [...pendingEvents].sort(
      (left, right) => left.createdAt.getTime() - right.createdAt.getTime(),
    )[0];

    return {
      counts,
      retryableCount: retryableEvents.length,
      oldestPendingAt: oldestPending?.createdAt.toISOString() ?? null,
      nextRetryAt: nextRetry?.availableAt.toISOString() ?? null,
      latestFailure: latestFailure
        ? {
            id: latestFailure.id,
            eventType: latestFailure.eventType,
            source: latestFailure.source,
            lastError: latestFailure.lastError,
            updatedAt: latestFailure.updatedAt.toISOString(),
          }
        : null,
    };
  }

  async replayEvent(eventId: string): Promise<OutboxEvent> {
    const event = await this.outboxRepo.findOne({ where: { id: eventId } });
    if (!event) {
      throw new NotFoundException(`Outbox event ${eventId} not found`);
    }

    event.status = 'pending';
    event.attempts = 0;
    event.lastError = null;
    event.availableAt = new Date();
    await this.outboxRepo.save(event);
    return this.dispatchStoredEvent(event);
  }

  async markDeadLetter(eventId: string): Promise<OutboxEvent> {
    const event = await this.outboxRepo.findOne({ where: { id: eventId } });
    if (!event) {
      throw new NotFoundException(`Outbox event ${eventId} not found`);
    }

    event.status = 'dead_letter';
    event.lastError = event.lastError ?? 'Forced into dead-letter by admin operator';
    event.availableAt = new Date();
    return this.outboxRepo.save(event);
  }

  async listProblemBacklog(limit = 10): Promise<OutboxBacklogItem[]> {
    const events = await this.outboxRepo.find({
      where: [{ status: 'pending' }, { status: 'failed' }, { status: 'dead_letter' }],
      order: { updatedAt: 'DESC' },
      take: limit,
    });

    return events.map((event) => ({
      id: event.id,
      eventType: event.eventType,
      source: event.source,
      status: event.status,
      attempts: event.attempts,
      maxAttempts: event.maxAttempts,
      availableAt: event.availableAt.toISOString(),
      lastError: event.lastError,
      updatedAt: event.updatedAt.toISOString(),
    }));
  }

  private async dispatchStoredEvent(event: OutboxEvent): Promise<OutboxEvent> {
    const attemptAt = new Date();
    event.attempts += 1;
    event.lastAttemptAt = attemptAt;

    try {
      this.eventEmitter.emit(event.eventType, event.payload);
      event.status = 'dispatched';
      event.dispatchedAt = attemptAt;
      event.lastError = null;
      event.availableAt = attemptAt;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown outbox dispatch failure';
      event.lastError = message;
      event.status = event.attempts >= event.maxAttempts ? 'dead_letter' : 'failed';
      event.availableAt = new Date(Date.now() + this.computeBackoffMs(event.attempts));
      this.logger.error(
        `Failed to dispatch outbox event ${event.eventType} (${event.id}): ${message}`,
        error instanceof Error ? error.stack : undefined,
      );
    }

    return this.outboxRepo.save(event);
  }

  private computeBackoffMs(attempts: number): number {
    return Math.min(60_000, Math.max(5_000, attempts * 5_000));
  }
}
