import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { connect, ChannelModel, ConsumeMessage } from 'amqplib';
import { RealtimeGateway } from '../realtime.gateway';

const RABBITMQ_EXCHANGE = 'coescd.events';

/**
 * Consumes events from RabbitMQ and fans them out to connected WebSocket clients.
 *
 * Each gateway instance creates its own exclusive, auto-delete queue bound to the
 * `coescd.events` topic exchange with the `gateway.#` wildcard.  When a message is
 * published on routing key `gateway.room` (channel fan-out) or `gateway.user`
 * (targeted delivery), every running instance receives the message and delivers it
 * to the sockets it locally owns.
 *
 * Reconnection uses exponential back-off (1 s → 2 s → 4 s … capped at 30 s).
 */
@Injectable()
export class RabbitMqGatewayConsumer implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RabbitMqGatewayConsumer.name);

  private connection: ChannelModel | null = null;
  private channel: import('amqplib').Channel | null = null;
  private destroyed = false;
  private reconnectDelay = 1_000; // ms — doubles on each failure, capped at 30 s

  constructor(private readonly gateway: RealtimeGateway) {}

  async onModuleInit(): Promise<void> {
    await this.connect();
  }

  async onModuleDestroy(): Promise<void> {
    this.destroyed = true;
    await this.channel?.close().catch(() => undefined);
    await this.connection?.close().catch(() => undefined);
  }

  // ─── Connection management ────────────────────────────────────────────────────

  private async connect(): Promise<void> {
    const url = process.env.RABBITMQ_URL;
    if (!url) {
      this.logger.warn('RABBITMQ_URL not set — gateway consumer disabled');
      return;
    }

    try {
      this.connection = await connect(url);

      this.connection.on('error', (err) => {
        this.logger.warn(`RabbitMQ connection error: ${err.message}`);
      });
      this.connection.on('close', () => {
        if (!this.destroyed) {
          this.logger.warn('RabbitMQ connection closed — scheduling reconnect');
          this.scheduleReconnect();
        }
      });

      this.channel = await this.connection.createChannel();

      // Ensure the exchange exists (idempotent)
      await this.channel.assertExchange(RABBITMQ_EXCHANGE, 'topic', { durable: true });

      // Exclusive, auto-delete queue — one per gateway instance
      const { queue } = await this.channel.assertQueue('', {
        exclusive: true,
        autoDelete: true,
      });

      // Bind to all gateway routing keys: gateway.room, gateway.user, etc.
      await this.channel.bindQueue(queue, RABBITMQ_EXCHANGE, 'gateway.#');

      // Prefetch — don't swamp a single instance on reconnect
      this.channel.prefetch(50);

      await this.channel.consume(queue, (msg) => this.handleMessage(msg), { noAck: false });

      this.reconnectDelay = 1_000; // reset on success
      this.logger.log(`Gateway consumer connected; queue: ${queue}`);
    } catch (err) {
      this.logger.warn(
        `Gateway consumer failed to connect: ${err instanceof Error ? err.message : String(err)}`,
      );
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect(): void {
    if (this.destroyed) return;

    setTimeout(() => {
      this.channel = null;
      this.connection = null;
      void this.connect();
    }, this.reconnectDelay);

    this.reconnectDelay = Math.min(this.reconnectDelay * 2, 30_000);
  }

  // ─── Message dispatch ─────────────────────────────────────────────────────────

  private handleMessage(msg: ConsumeMessage | null): void {
    if (!msg) return;

    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(msg.content.toString('utf8'));
    } catch {
      this.logger.warn('Received non-JSON message on gateway queue — discarding');
      this.channel?.ack(msg);
      return;
    }

    const routingKey = msg.fields.routingKey;

    try {
      if (routingKey === 'gateway.room') {
        this.dispatchToChannel(payload);
      } else if (routingKey === 'gateway.user') {
        this.dispatchToUser(payload);
      } else {
        this.logger.debug(`Unhandled routing key: ${routingKey}`);
      }
    } catch (err) {
      this.logger.error(
        `Error dispatching gateway message: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    this.channel?.ack(msg);
  }

  // ─── Dispatch strategies ──────────────────────────────────────────────────────

  /**
   * Channel fan-out: deliver to all sockets subscribed to `roomId`.
   *
   * Expected payload shape (from GatewayEventsService.publishToRoom):
   * ```json
   * { "type": "message.created", "roomId": "<uuid>", ...eventData }
   * ```
   */
  private dispatchToChannel(payload: Record<string, unknown>): void {
    const channelId = payload.roomId as string | undefined;
    if (!channelId) {
      this.logger.warn('gateway.room message missing roomId — skipping');
      return;
    }

    // Wrap in a standard client envelope
    const envelope = {
      event: payload.type ?? 'room.event',
      data: payload,
    };

    this.gateway.deliverToChannel(channelId, envelope);
  }

  /**
   * User-targeted delivery: deliver to all sockets belonging to `targetUserId`.
   *
   * Expected payload shape (from GatewayEventsService.publishToUser):
   * ```json
   * { "type": "call.invitation", "targetUserId": "<uuid>", ...eventData }
   * ```
   */
  private dispatchToUser(payload: Record<string, unknown>): void {
    const targetUserId = payload.targetUserId as string | undefined;
    if (!targetUserId) {
      this.logger.warn('gateway.user message missing targetUserId — skipping');
      return;
    }

    const envelope = {
      event: payload.type ?? 'user.event',
      data: payload,
    };

    this.gateway.deliverToUser(targetUserId, envelope);
  }
}
