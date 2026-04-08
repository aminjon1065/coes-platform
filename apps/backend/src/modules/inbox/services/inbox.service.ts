import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { createHash } from 'crypto';
import { InboxMessage } from '../entities/inbox-message.entity';
import { EventEmitter2 } from '@nestjs/event-emitter';

type InboxStatusCounts = {
  processing: number;
  completed: number;
  failed: number;
};

export type InboxOperationsSummary = {
  counts: InboxStatusCounts;
  consumerCount: number;
  latestFailure: {
    id: string;
    consumer: string;
    eventType: string;
    lastError: string | null;
    updatedAt: string;
  } | null;
  staleProcessingCount: number;
};

export type InboxBacklogItem = {
  id: string;
  consumer: string;
  eventType: string;
  status: 'processing' | 'completed' | 'failed';
  attempts: number;
  lastError: string | null;
  updatedAt: string;
};

@Injectable()
export class InboxService {
  constructor(
    @InjectRepository(InboxMessage)
    private readonly inboxRepo: Repository<InboxMessage>,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async executeOnce(
    consumer: string,
    eventType: string,
    payload: Record<string, unknown>,
    handler: () => Promise<void>,
  ): Promise<boolean> {
    const payloadHash = this.hashPayload(payload);
    const messageKey = `${consumer}:${eventType}:${payloadHash}`;

    let message = await this.inboxRepo.findOne({ where: { messageKey } });
    if (message?.status === 'completed' || message?.status === 'processing') {
      return false;
    }

    if (!message) {
      message = this.inboxRepo.create({
        consumer,
        eventType,
        messageKey,
        payloadHash,
        payload,
        status: 'processing',
        attempts: 0,
      });
    } else {
      message.status = 'processing';
      message.lastError = null;
      message.payload = payload;
    }

    message.attempts += 1;
    await this.inboxRepo.save(message);

    try {
      await handler();
      message.status = 'completed';
      message.lastError = null;
      await this.inboxRepo.save(message);
      return true;
    } catch (error) {
      message.status = 'failed';
      message.lastError = error instanceof Error ? error.message : 'Unknown inbox processing failure';
      await this.inboxRepo.save(message);
      throw error;
    }
  }

  async getOperationsSummary(): Promise<InboxOperationsSummary> {
    const messages = await this.inboxRepo.find({
      order: {
        updatedAt: 'DESC',
      },
    });
    const staleProcessingThreshold = Date.now() - 5 * 60_000;

    const counts = messages.reduce<InboxStatusCounts>(
      (summary, message) => {
        if (message.status === 'processing') {
          summary.processing += 1;
        } else if (message.status === 'completed') {
          summary.completed += 1;
        } else if (message.status === 'failed') {
          summary.failed += 1;
        }

        return summary;
      },
      {
        processing: 0,
        completed: 0,
        failed: 0,
      },
    );

    const latestFailure = messages.find((message) => message.status === 'failed') ?? null;
    const staleProcessingCount = messages.filter(
      (message) =>
        message.status === 'processing' &&
        message.updatedAt.getTime() <= staleProcessingThreshold,
    ).length;

    return {
      counts,
      consumerCount: new Set(messages.map((message) => message.consumer)).size,
      latestFailure: latestFailure
        ? {
            id: latestFailure.id,
            consumer: latestFailure.consumer,
            eventType: latestFailure.eventType,
            lastError: latestFailure.lastError,
            updatedAt: latestFailure.updatedAt.toISOString(),
          }
        : null,
      staleProcessingCount,
    };
  }

  async retryMessage(messageId: string): Promise<InboxMessage> {
    const message = await this.inboxRepo.findOne({ where: { id: messageId } });
    if (!message) {
      throw new NotFoundException(`Inbox message ${messageId} not found`);
    }

    this.eventEmitter.emit(message.eventType, message.payload);

    const refreshed = await this.inboxRepo.findOne({ where: { id: messageId } });
    return refreshed ?? message;
  }

  async resetMessage(messageId: string): Promise<InboxMessage> {
    const message = await this.inboxRepo.findOne({ where: { id: messageId } });
    if (!message) {
      throw new NotFoundException(`Inbox message ${messageId} not found`);
    }

    message.status = 'failed';
    message.attempts = 0;
    message.lastError = 'Reset by admin operator';
    return this.inboxRepo.save(message);
  }

  async listProblemBacklog(limit = 10): Promise<InboxBacklogItem[]> {
    const messages = await this.inboxRepo.find({
      where: [{ status: 'processing' }, { status: 'failed' }],
      order: { updatedAt: 'DESC' },
      take: limit,
    });

    return messages.map((message) => ({
      id: message.id,
      consumer: message.consumer,
      eventType: message.eventType,
      status: message.status,
      attempts: message.attempts,
      lastError: message.lastError,
      updatedAt: message.updatedAt.toISOString(),
    }));
  }

  private hashPayload(payload: Record<string, unknown>) {
    return createHash('sha256')
      .update(this.stableStringify(payload))
      .digest('hex');
  }

  private stableStringify(value: unknown): string {
    if (value === null || typeof value !== 'object') {
      return JSON.stringify(value);
    }

    if (Array.isArray(value)) {
      return `[${value.map((item) => this.stableStringify(item)).join(',')}]`;
    }

    const entries = Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nested]) => `"${key}":${this.stableStringify(nested)}`);

    return `{${entries.join(',')}}`;
  }
}
