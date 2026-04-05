import { WebSocketServer, WebSocket } from 'ws';
import { IncomingMessage } from 'http';
import { v4 as uuidv4 } from 'uuid';
import { Redis } from 'ioredis';
import { connect as amqpConnect, ChannelModel, Channel } from 'amqplib';
import { logger } from './logger';
import { validateAccessToken, extractBearerToken } from './auth/token-validator';
import { PresenceManager } from './presence/presence-manager';

const RABBITMQ_EXCHANGE = 'coescd.events';

export interface ConnectedClient {
  id: string;      // connection id
  userId: string;
  username: string;
  socket: WebSocket;
  connectedAt: Date;
  rooms: Set<string>;
}

export class GatewayServer {
  private clients = new Map<string, ConnectedClient>();
  private userConnections = new Map<string, Set<string>>(); // userId → connIds
  private redis: Redis;
  private amqpConnection: ChannelModel | null = null;
  private amqpChannel: Channel | null = null;
  private presence: PresenceManager;

  constructor(private readonly wss: WebSocketServer) {
    this.redis = new Redis({
      host: process.env.REDIS_HOST ?? 'localhost',
      port: parseInt(process.env.REDIS_PORT ?? '6379', 10),
      password: process.env.REDIS_PASSWORD,
      lazyConnect: true,
    });
    this.presence = new PresenceManager(this.redis);
  }

  async start(): Promise<void> {
    await this.redis.connect();
    await this.connectRabbitMQ();

    this.wss.on('connection', (socket: WebSocket, req: IncomingMessage) => {
      this.handleConnection(socket, req);
    });

    logger.info('WebSocket server ready');
  }

  async stop(): Promise<void> {
    for (const client of this.clients.values()) {
      client.socket.close(1001, 'Server shutting down');
    }
    this.clients.clear();
    this.userConnections.clear();

    await this.amqpChannel?.close();
    await this.amqpConnection?.close();
    await this.redis.quit();
  }

  private handleConnection(socket: WebSocket, req: IncomingMessage): void {
    // Extract token from query string or Authorization header
    const url = new URL(req.url ?? '', 'http://localhost');
    const rawToken =
      extractBearerToken(req.headers.authorization) ??
      url.searchParams.get('token');

    if (!rawToken) {
      socket.close(4001, 'Authentication required');
      return;
    }

    let claims;
    try {
      claims = validateAccessToken(rawToken);
    } catch {
      socket.close(4003, 'Invalid or expired token');
      return;
    }

    const connId = uuidv4();
    const client: ConnectedClient = {
      id: connId,
      userId: claims.sub,
      username: claims.username,
      socket,
      connectedAt: new Date(),
      rooms: new Set(),
    };

    this.clients.set(connId, client);

    // Track user → connections mapping
    if (!this.userConnections.has(claims.sub)) {
      this.userConnections.set(claims.sub, new Set());
    }
    this.userConnections.get(claims.sub)!.add(connId);

    this.presence.setOnline(claims.sub).catch((err) =>
      logger.error(err, 'Failed to set presence'),
    );

    logger.info({ connId, userId: claims.sub, username: claims.username }, 'Client connected');

    socket.on('message', (data) => {
      this.handleMessage(client, data.toString());
    });

    socket.on('close', () => {
      this.handleDisconnect(client);
    });

    socket.on('error', (err) => {
      logger.error({ err, connId }, 'WebSocket error');
    });

    // Send connection acknowledgement
    this.send(socket, { type: 'connected', payload: { connId } });
  }

  private handleMessage(client: ConnectedClient, raw: string): void {
    let message: { type: string; payload?: unknown };

    try {
      message = JSON.parse(raw);
    } catch {
      this.send(client.socket, { type: 'error', payload: { message: 'Invalid JSON' } });
      return;
    }

    switch (message.type) {
      case 'ping':
        this.send(client.socket, { type: 'pong', payload: { ts: Date.now() } });
        break;

      case 'join_room': {
        const roomId = (message.payload as { roomId?: string })?.roomId;
        if (roomId) {
          client.rooms.add(roomId);
          this.send(client.socket, { type: 'room_joined', payload: { roomId } });
        }
        break;
      }

      case 'leave_room': {
        const roomId = (message.payload as { roomId?: string })?.roomId;
        if (roomId) {
          client.rooms.delete(roomId);
        }
        break;
      }

      default:
        logger.debug({ type: message.type, userId: client.userId }, 'Unknown message type');
    }
  }

  private handleDisconnect(client: ConnectedClient): void {
    this.clients.delete(client.id);

    const userConns = this.userConnections.get(client.userId);
    if (userConns) {
      userConns.delete(client.id);
      if (userConns.size === 0) {
        this.userConnections.delete(client.userId);
        this.presence.setOffline(client.userId).catch((err) =>
          logger.error(err, 'Failed to clear presence'),
        );
      }
    }

    logger.info({ connId: client.id, userId: client.userId }, 'Client disconnected');
  }

  /** Broadcast a platform event to all clients subscribed to a room */
  broadcastToRoom(roomId: string, event: unknown): void {
    const payload = JSON.stringify(event);
    for (const client of this.clients.values()) {
      if (client.rooms.has(roomId) && client.socket.readyState === WebSocket.OPEN) {
        client.socket.send(payload);
      }
    }
  }

  /** Send an event directly to a specific user (all their connections) */
  sendToUser(userId: string, event: unknown): void {
    const connIds = this.userConnections.get(userId);
    if (!connIds) return;
    const payload = JSON.stringify(event);
    for (const connId of connIds) {
      const client = this.clients.get(connId);
      if (client && client.socket.readyState === WebSocket.OPEN) {
        client.socket.send(payload);
      }
    }
  }

  private send(socket: WebSocket, data: unknown): void {
    if (socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(data));
    }
  }

  private async connectRabbitMQ(): Promise<void> {
    const url = process.env.RABBITMQ_URL;
    if (!url) {
      logger.warn('RABBITMQ_URL not set — event fan-out disabled');
      return;
    }

    try {
      const conn = await amqpConnect(url);
      const channel = await conn.createChannel();

      this.amqpConnection = conn;
      this.amqpChannel = channel;

      await channel.assertExchange(RABBITMQ_EXCHANGE, 'topic', { durable: true });

      const { queue } = await channel.assertQueue('gateway.fan-out', {
        durable: false,
        exclusive: true,
        autoDelete: true,
      });

      await channel.bindQueue(queue, RABBITMQ_EXCHANGE, 'gateway.#');

      channel.consume(queue, (msg) => {
        if (!msg) return;
        try {
          const event = JSON.parse(msg.content.toString());
          this.handlePlatformEvent(event);
        } catch (err) {
          logger.error(err, 'Failed to process AMQP message');
        }
        channel.ack(msg);
      });

      logger.info('Connected to RabbitMQ event bus');
    } catch (err) {
      logger.error(err, 'RabbitMQ connection failed — gateway running without event bus');
    }
  }

  private handlePlatformEvent(event: {
    type: string;
    userId?: string;
    roomId?: string;
    payload: unknown;
  }): void {
    if (event.userId) {
      this.sendToUser(event.userId, event);
    } else if (event.roomId) {
      this.broadcastToRoom(event.roomId, event);
    }
  }
}
