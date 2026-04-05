import { WebSocketServer, WebSocket } from 'ws';
import { IncomingMessage } from 'http';
import { v4 as uuidv4 } from 'uuid';
import { Redis } from 'ioredis';
import { connect as amqpConnect, ChannelModel, Channel } from 'amqplib';

import { WorkerPool } from './workers/worker-pool';
import { SessionManager } from './sessions/session-manager';
import { SignalingHandler } from './signaling/signaling-handler';
import { validateAccessToken, extractBearerToken } from './auth/token-validator';
import { logger } from './logger';

const RABBITMQ_EXCHANGE = 'coescd.events';

export class MediaServer {
  private workerPool: WorkerPool;
  private sessionManager: SessionManager;
  private signalingHandler: SignalingHandler;
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
    this.signalingHandler = new SignalingHandler(this.sessionManager);
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

  private handleBackendCommand(event: { type: string; sessionId?: string }): void {
    switch (event.type) {
      case 'media.session.end':
        if (event.sessionId) {
          this.sessionManager
            .endSession(event.sessionId)
            .catch((err) => logger.error(err, 'Failed to end session via AMQP command'));
        }
        break;

      default:
        logger.debug({ type: event.type }, 'Unknown backend command');
    }
  }
}
