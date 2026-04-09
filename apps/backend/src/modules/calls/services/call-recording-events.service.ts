import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { connect, ChannelModel, Channel, ConsumeMessage } from 'amqplib';
import { CallsService } from './calls.service';

const RABBITMQ_EXCHANGE = 'coescd.events';
const RECONNECT_DELAY_MS = 5_000;
const PREFETCH_COUNT = 10;

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
  private destroyed = false;
  private reconnectTimer: NodeJS.Timeout | null = null;

  constructor(private readonly callsService: CallsService) {}

  async onModuleInit(): Promise<void> {
    await this.connect();
  }

  async onModuleDestroy(): Promise<void> {
    this.destroyed = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    await this.channel?.close().catch(() => undefined);
    await this.connection?.close().catch(() => undefined);
  }

  private async connect(): Promise<void> {
    const url = process.env.RABBITMQ_URL;
    if (!url) {
      return;
    }

    try {
      this.connection = await connect(url);
      this.channel = await this.connection.createChannel();

      // Limit in-flight messages so the service isn't overwhelmed
      await this.channel.prefetch(PREFETCH_COUNT);

      await this.channel.assertExchange(RABBITMQ_EXCHANGE, 'topic', { durable: true });

      const { queue } = await this.channel.assertQueue('', {
        durable: false,
        exclusive: true,
        autoDelete: true,
      });
      await this.channel.bindQueue(queue, RABBITMQ_EXCHANGE, 'media.recording.*');

      await this.channel.consume(queue, (message) => {
        void this.handleMessage(message);
      });

      // Reconnect on unexpected connection/channel errors
      this.connection.on('error', (err) => {
        this.logger.warn(`RabbitMQ connection error: ${err.message}`);
        this.scheduleReconnect();
      });
      this.connection.on('close', () => {
        if (!this.destroyed) {
          this.logger.warn('RabbitMQ connection closed unexpectedly — scheduling reconnect');
          this.scheduleReconnect();
        }
      });
      this.channel.on('error', (err) => {
        this.logger.warn(`RabbitMQ channel error: ${err.message}`);
      });

      this.logger.log('RabbitMQ recording event consumer connected');
    } catch (error) {
      this.logger.warn(
        `Call recording event bus unavailable: ${error instanceof Error ? error.message : 'unknown error'}`,
      );
      this.channel = null;
      this.connection = null;
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect(): void {
    if (this.destroyed || this.reconnectTimer) {
      return;
    }
    this.channel = null;
    this.connection = null;
    this.reconnectTimer = setTimeout(async () => {
      this.reconnectTimer = null;
      await this.connect();
    }, RECONNECT_DELAY_MS);
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
