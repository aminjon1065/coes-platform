import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { connect, ChannelModel, Channel, ConsumeMessage } from 'amqplib';
import { CallsService } from './calls.service';

const RABBITMQ_EXCHANGE = 'coescd.events';

type RecordingEvent =
  | {
      type: 'media.recording.started';
      recordingId: string;
      sessionId: string;
    }
  | {
      type: 'media.recording.ready';
      recordingId: string;
      sessionId: string;
      storageKey: string;
      sizeBytes: number;
      durationSeconds: number;
    }
  | {
      type: 'media.recording.failed';
      recordingId: string;
      sessionId: string;
      error: string;
    };

@Injectable()
export class CallRecordingEventsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CallRecordingEventsService.name);
  private connection: ChannelModel | null = null;
  private channel: Channel | null = null;

  constructor(private readonly callsService: CallsService) {}

  async onModuleInit(): Promise<void> {
    const url = process.env.RABBITMQ_URL;
    if (!url) {
      return;
    }

    try {
      this.connection = await connect(url);
      this.channel = await this.connection.createChannel();
      await this.channel.assertExchange(RABBITMQ_EXCHANGE, 'topic', { durable: true });

      const { queue } = await this.channel.assertQueue('backend.call-recording.events', {
        durable: false,
        exclusive: true,
        autoDelete: true,
      });
      await this.channel.bindQueue(queue, RABBITMQ_EXCHANGE, 'media.recording.*');

      await this.channel.consume(queue, (message) => {
        void this.handleMessage(message);
      });
    } catch (error) {
      this.logger.warn(
        `Call recording event bus unavailable: ${error instanceof Error ? error.message : 'unknown error'}`,
      );
      this.channel = null;
      this.connection = null;
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.channel?.close().catch(() => undefined);
    await this.connection?.close().catch(() => undefined);
  }

  private async handleMessage(message: ConsumeMessage | null): Promise<void> {
    if (!message || !this.channel) {
      return;
    }

    try {
      const event = JSON.parse(message.content.toString()) as RecordingEvent;
      await this.dispatch(event);
      this.channel.ack(message);
    } catch (error) {
      this.logger.error(
        error instanceof Error ? error.stack : String(error),
        'Failed to process call recording event',
      );
      this.channel.nack(message, false, false);
    }
  }

  private async dispatch(event: RecordingEvent): Promise<void> {
    switch (event.type) {
      case 'media.recording.started':
        await this.callsService.markRecordingStarted(event.recordingId, event.sessionId);
        return;

      case 'media.recording.ready':
        await this.callsService.markRecordingReady(event.recordingId, {
          sessionId: event.sessionId,
          storageKey: event.storageKey,
          sizeBytes: event.sizeBytes,
          durationSeconds: event.durationSeconds,
        });
        return;

      case 'media.recording.failed':
        await this.callsService.markRecordingFailed(event.recordingId, {
          sessionId: event.sessionId,
          error: event.error,
        });
        return;
    }
  }
}
