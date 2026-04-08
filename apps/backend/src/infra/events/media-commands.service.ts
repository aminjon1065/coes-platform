import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { connect, ChannelModel, Channel } from 'amqplib';

const RABBITMQ_EXCHANGE = 'coescd.events';

@Injectable()
export class MediaCommandsService implements OnModuleDestroy {
  private readonly logger = new Logger(MediaCommandsService.name);
  private connection: ChannelModel | null = null;
  private channel: Channel | null = null;
  private connecting: Promise<void> | null = null;

  async endCallSession(sessionId: string): Promise<void> {
    await this.publish({
      type: 'media.session.end',
      sessionId,
    });
  }

  async kickParticipant(sessionId: string, participantId: string): Promise<void> {
    await this.publish({
      type: 'media.participant.kick',
      sessionId,
      participantId,
    });
  }

  async setParticipantMute(
    sessionId: string,
    participantId: string,
    audioMuted?: boolean,
    videoMuted?: boolean,
  ): Promise<void> {
    await this.publish({
      type: 'media.participant.mute',
      sessionId,
      participantId,
      audioMuted,
      videoMuted,
    });
  }

  async startRecording(sessionId: string, recordingId: string): Promise<void> {
    await this.publish({
      type: 'media.recording.start',
      sessionId,
      recordingId,
    });
  }

  async stopRecording(sessionId: string, recordingId: string): Promise<void> {
    await this.publish({
      type: 'media.recording.stop',
      sessionId,
      recordingId,
    });
  }

  private async publish(payload: Record<string, unknown>): Promise<void> {
    if (!(await this.ensureChannel())) {
      return;
    }

    this.channel!.publish(
      RABBITMQ_EXCHANGE,
      String(payload.type ?? 'media.unknown'),
      Buffer.from(JSON.stringify(payload)),
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
          this.logger.warn(
            `Media command bus unavailable: ${error instanceof Error ? error.message : 'unknown error'}`,
          );
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
