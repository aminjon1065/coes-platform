import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { connect, ChannelModel, Channel } from 'amqplib';

const RABBITMQ_EXCHANGE = 'coescd.events';

@Injectable()
export class GatewayEventsService implements OnModuleDestroy {
  private readonly logger = new Logger(GatewayEventsService.name);
  private connection: ChannelModel | null = null;
  private channel: Channel | null = null;
  private connecting: Promise<void> | null = null;

  /**
   * Publish an event to all clients subscribed to a channel (room fan-out).
   *
   * Routing key: `gateway.room`
   * Consumer: RabbitMqGatewayConsumer → RealtimeGateway.deliverToChannel()
   */
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

  /**
   * Publish an event targeted at a specific user (all their connected sockets).
   *
   * Routing key: `gateway.user`
   * Consumer: RabbitMqGatewayConsumer → RealtimeGateway.deliverToUser()
   *
   * Use this for call invitations, DM read receipts, per-user notifications that
   * should not be broadcast to a whole channel.
   */
  async publishToUser(targetUserId: string, event: Record<string, unknown>): Promise<void> {
    if (!(await this.ensureChannel())) {
      return;
    }

    this.channel!.publish(
      RABBITMQ_EXCHANGE,
      'gateway.user',
      Buffer.from(
        JSON.stringify({
          ...event,
          targetUserId,
        }),
      ),
      { contentType: 'application/json' },
    );
  }

  /**
   * Publish a presence change to all users who should see it.
   *
   * Broadcasts to the `presence.{userId}` room — clients interested in a user's
   * presence subscribe to that virtual room.  For simplicity in Phase 1, this is
   * fanned out to all channels the user belongs to (handled by the consumer).
   */
  async publishPresenceChange(
    userId: string,
    status: string,
    affectedChannelIds: string[],
  ): Promise<void> {
    const event = {
      type: 'presence.changed',
      userId,
      status,
      ts: Date.now(),
    };

    // Fan out to each channel the user belongs to so members see the update
    await Promise.all(
      affectedChannelIds.map((channelId) => this.publishToRoom(channelId, event)),
    );
  }

  /**
   * Publish a call-lifecycle event to a specific user.
   *
   * Used for call invitations, SFU SDP answers delivered back to the caller,
   * and ICE candidates originating from the SFU.
   */
  async publishCallEvent(
    targetUserId: string,
    callEvent: Record<string, unknown>,
  ): Promise<void> {
    await this.publishToUser(targetUserId, {
      type: `call.${String(callEvent.subtype ?? 'event')}`,
      ...callEvent,
    });
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
