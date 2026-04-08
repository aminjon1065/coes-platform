import { WebSocketServer, WebSocket } from 'ws';
import { IncomingMessage } from 'http';
import { v4 as uuidv4 } from 'uuid';
import { Redis } from 'ioredis';
import { connect as amqpConnect, ChannelModel, Channel } from 'amqplib';

import { WorkerPool } from './workers/worker-pool';
import { RecordingManager } from './recording/recording-manager';
import { SessionManager } from './sessions/session-manager';
import { SignalingHandler } from './signaling/signaling-handler';
import { validateAccessToken, extractBearerToken } from './auth/token-validator';
import { logger } from './logger';

const RABBITMQ_EXCHANGE = 'coescd.events';

export class MediaServer {
  private workerPool: WorkerPool;
  private sessionManager: SessionManager;
  private signalingHandler: SignalingHandler;
  private recordingManager: RecordingManager;
  private redis: Redis;
  private amqpConnection: ChannelModel | null = null;
  private amqpChannel: Channel | null = null;

  constructor(private readonly wss: WebSocketServer) {
    this.redis = new Redis({
      host: process.env.REDIS_HOST ?? 'localhost',
      port: parseInt(process.env.REDIS_PORT ?? '6379', 10),
      password: process.env.REDIS_PASSWORD,
      lazyConnect: true,
    });

    this.workerPool = new WorkerPool();
    this.sessionManager = new SessionManager(this.workerPool, this.redis);
    this.recordingManager = new RecordingManager(this.sessionManager, (event) =>
      this.publishRecordingEvent(event),
    );
    this.signalingHandler = new SignalingHandler(this.sessionManager, {
      onProducerAdded: (sessionId, participantId, producer) =>
        this.recordingManager.handleProducerAdded(sessionId, participantId, producer),
    });
  }

  async start(): Promise<void> {
    await this.redis.connect();
    await this.workerPool.start();
    await this.connectRabbitMQ();

    this.wss.on('connection', (socket: WebSocket, req: IncomingMessage) => {
      this.handleConnection(socket, req);
    });

    logger.info(
      { workers: this.workerPool.size },
      'Media server ready',
    );
  }

  async stop(): Promise<void> {
    await this.recordingManager.stopAll();

    // End all active sessions
    const sessionIds = this.sessionManager.getActiveSessions();
    await Promise.allSettled(sessionIds.map((id) => this.sessionManager.endSession(id)));

    this.wss.clients.forEach((socket) => socket.close(1001, 'Server shutting down'));

    await this.amqpChannel?.close();
    await this.amqpConnection?.close();
    await this.workerPool.stop();
    await this.redis.quit();
  }

  private handleConnection(socket: WebSocket, req: IncomingMessage): void {
    const url = new URL(req.url ?? '', 'http://localhost');
    const rawToken =
      extractBearerToken(req.headers.authorization) ??
      url.searchParams.get('token');

    if (!rawToken) {
      socket.close(4001, 'Authentication required');
      return;
    }

    let claims: { sub: string; username: string; positionId?: string };
    try {
      claims = validateAccessToken(rawToken);
    } catch {
      socket.close(4003, 'Invalid or expired token');
      return;
    }

    const connId = uuidv4();
    const participantId = claims.positionId ?? claims.sub;

    logger.info(
      { connId, userId: claims.sub, participantId },
      'Media signaling client connected',
    );

    this.signalingHandler.handle(socket, participantId, claims.sub, claims.username);

    socket.on('close', () => {
      logger.info({ connId, userId: claims.sub }, 'Media signaling client disconnected');
    });

    socket.on('error', (err) => {
      logger.error({ err, connId }, 'Media signaling WebSocket error');
    });

    // Acknowledge connection
    socket.send(
      JSON.stringify({ type: 'connected', payload: { connId, participantId } }),
    );
  }

  /** Publish a session-scoped event to RabbitMQ so the gateway fans it out */
  async publishSessionEvent(
    sessionId: string,
    eventType: string,
    payload: unknown,
  ): Promise<void> {
    if (!this.amqpChannel) return;
    try {
      const message = JSON.stringify({
        type: eventType,
        roomId: `call:${sessionId}`,
        payload,
        ts: Date.now(),
      });
      this.amqpChannel.publish(
        RABBITMQ_EXCHANGE,
        `gateway.room.call.${sessionId}`,
        Buffer.from(message),
        { persistent: false },
      );
    } catch (err) {
      logger.error(err, 'Failed to publish session event to RabbitMQ');
    }
  }

  private async connectRabbitMQ(): Promise<void> {
    const url = process.env.RABBITMQ_URL;
    if (!url) {
      logger.warn('RABBITMQ_URL not set — signaling event fan-out disabled');
      return;
    }

    try {
      const conn = await amqpConnect(url);
      const channel = await conn.createChannel();

      this.amqpConnection = conn;
      this.amqpChannel = channel;

      await channel.assertExchange(RABBITMQ_EXCHANGE, 'topic', { durable: true });

      // Listen for backend-initiated commands (e.g., force-end a call)
      const { queue } = await channel.assertQueue('media.commands', {
        durable: false,
        exclusive: true,
        autoDelete: true,
      });
      await channel.bindQueue(queue, RABBITMQ_EXCHANGE, 'media.#');

      channel.consume(queue, (msg) => {
        if (!msg) return;
        try {
          const event = JSON.parse(msg.content.toString());
          this.handleBackendCommand(event);
        } catch (err) {
          logger.error(err, 'Failed to process AMQP command');
        }
        channel.ack(msg);
      });

      logger.info('Connected to RabbitMQ event bus');
    } catch (err) {
      logger.error(err, 'RabbitMQ connection failed — media server running standalone');
    }
  }

  private handleBackendCommand(event: {
    type: string;
    sessionId?: string;
    participantId?: string;
    recordingId?: string;
    audioMuted?: boolean;
    videoMuted?: boolean;
  }): void {
    switch (event.type) {
      case 'media.session.end':
        if (event.sessionId) {
          void (async () => {
            try {
              await this.recordingManager.stopRecordingBySession(event.sessionId!);
              await this.sessionManager.endSession(event.sessionId!);
            } catch (err) {
              logger.error(err, 'Failed to end session via AMQP command');
            }
          })();
        }
        break;

      case 'media.participant.kick':
        if (event.sessionId && event.participantId) {
          void this.kickParticipant(event.sessionId, event.participantId);
        }
        break;

      case 'media.participant.mute':
        if (event.sessionId && event.participantId) {
          this.muteParticipant(
            event.sessionId,
            event.participantId,
            event.audioMuted,
            event.videoMuted,
          );
        }
        break;

      case 'media.recording.start':
        if (event.sessionId && event.recordingId) {
          void this.recordingManager
            .startRecording(event.sessionId, event.recordingId)
            .catch((err) => logger.error(err, 'Failed to start recording via AMQP command'));
        }
        break;

      case 'media.recording.stop':
        if (event.recordingId) {
          void this.recordingManager
            .stopRecording(event.recordingId)
            .catch((err) => logger.error(err, 'Failed to stop recording via AMQP command'));
        }
        break;

      default:
        logger.debug({ type: event.type }, 'Unknown backend command');
    }
  }

  private async publishRecordingEvent(event: Record<string, unknown>): Promise<void> {
    if (!this.amqpChannel) {
      return;
    }

    try {
      this.amqpChannel.publish(
        RABBITMQ_EXCHANGE,
        String(event.type ?? 'media.recording.unknown'),
        Buffer.from(JSON.stringify(event)),
        { contentType: 'application/json' },
      );
    } catch (err) {
      logger.error(err, 'Failed to publish recording event to RabbitMQ');
    }
  }

  private async kickParticipant(sessionId: string, participantId: string): Promise<void> {
    const session = this.sessionManager.getSession(sessionId);
    const participant = this.sessionManager.getParticipant(sessionId, participantId);
    if (!session || !participant) {
      return;
    }

    if (participant.socket?.readyState === WebSocket.OPEN) {
      participant.socket.send(
        JSON.stringify({
          type: 'moderator_kicked',
          payload: { participantId },
        }),
      );
      participant.socket.close(4009, 'Removed by moderator');
    }

    await this.sessionManager.removeParticipant(sessionId, participantId);
    for (const otherParticipant of session.participants.values()) {
      if (otherParticipant.socket?.readyState === WebSocket.OPEN) {
        otherParticipant.socket.send(
          JSON.stringify({
            type: 'participant_left',
            payload: { participantId },
          }),
        );
      }
    }
  }

  private muteParticipant(
    sessionId: string,
    participantId: string,
    audioMuted?: boolean,
    videoMuted?: boolean,
  ): void {
    const result = this.sessionManager.setParticipantMute(
      sessionId,
      participantId,
      audioMuted,
      videoMuted,
    );
    if (!result) {
      return;
    }

    if (result.participant.socket?.readyState === WebSocket.OPEN) {
      result.participant.socket.send(
        JSON.stringify({
          type: 'moderator_mute',
          payload: {
            audioMuted: result.participant.audioMuted,
            videoMuted: result.participant.videoMuted,
          },
        }),
      );
    }

    for (const otherParticipant of result.session.participants.values()) {
      if (otherParticipant.socket?.readyState === WebSocket.OPEN) {
        otherParticipant.socket.send(
          JSON.stringify({
            type: 'mute_changed',
            payload: {
              participantId,
              audioMuted: result.participant.audioMuted,
              videoMuted: result.participant.videoMuted,
            },
          }),
        );
      }
    }
  }
}
