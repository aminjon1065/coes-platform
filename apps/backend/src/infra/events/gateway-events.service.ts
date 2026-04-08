import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { connect, ChannelModel, Channel } from 'amqplib';

const RABBITMQ_EXCHANGE = 'coescd.events';

@Injectable()
export class GatewayEventsService implements OnModuleDestroy {
  private readonly logger = new Logger(GatewayEventsService.name);
  private connection: ChannelModel | null = null;
  private channel: Channel | null = null;
  private connecting: Promise<void> | null = null;

  async publishToRoom(roomId: string, event: Record<string, unknown>): Promise<void> {
    if (!(await this.ensureChannel())) {
      return;
    }

    this.channel!.publish(
      RABBITMQ_EXCHANGE,
      'gateway.room',
      Buffer.from(
        JSON.stringify({
          ...event,
          roomId,
        }),
      ),
      { contentType: 'application/json' },
    );
  }

  async onModuleDestroy(): Promise<void> {
    await this.channel?.close().catch(() => undefined);
    await this.connection?.close().catch(() => undefined);
  }

  private async ensureChannel(): Promise<boolean> {
    if (this.channel) {
      return true;
    }

    const url = process.env.RABBITMQ_URL;
    if (!url) {
      return false;
    }

    if (!this.connecting) {
      this.connecting = (async () => {
        try {
          this.connection = await connect(url);
          this.channel = await this.connection.createChannel();
          await this.channel.assertExchange(RABBITMQ_EXCHANGE, 'topic', { durable: true });
        } catch (error) {
          this.logger.warn(`Gateway event bus unavailable: ${error instanceof Error ? error.message : 'unknown error'}`);
          this.connection = null;
          this.channel = null;
        } finally {
          this.connecting = null;
        }
      })();
    }

    await this.connecting;
    return Boolean(this.channel);
  }
}
