import { Logger } from '@nestjs/common';
import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  MessageBody,
  ConnectedSocket,
  WsResponse,
} from '@nestjs/websockets';
import { Server, WebSocket } from 'ws';
import { JwtService } from '@nestjs/jwt';
import { EventEmitter2 } from '@nestjs/event-emitter';

import { ConnectionRegistryService } from './services/connection-registry.service';
import { ChatService } from '../chat/services/chat.service';
import { PresenceService, PresenceStatus } from '../chat/services/presence.service';
import { CallsService } from '../calls/services/calls.service';
import { AuditService } from '../audit/services/audit.service';

/** Instance identifier — unique per process restart */
const INSTANCE_ID = `gw-${Date.now()}`;

/**
 * Real-time WebSocket gateway (§5 of Chat-AudioVideo-Realtime-Architecture.md).
 *
 * Runs on WS_PORT (default 4001) alongside the Fastify HTTP server on port 4000.
 *
 * Responsibilities:
 *  - Authenticate connections (JWT in Upgrade header or first message)
 *  - Register connections in the ConnectionRegistry (Redis)
 *  - Manage presence via PresenceService
 *  - Deliver inbound events from RabbitMQ to connected clients
 *  - Relay chat events (typing, read receipts) from clients to domain services
 *  - Relay WebRTC signaling events (call.sdp_offer/answer, ice_candidate) to SFU
 *
 * Connection lifecycle:
 *  Phase 1 — TLS + WebSocket Upgrade (handled by Nginx / WsAdapter)
 *  Phase 2 — JWT authentication (first 'auth' message or Authorization header)
 *  Phase 3 — Gateway registration + presence → ONLINE
 *  Phase 4 — State sync: unread counts, pending deliveries
 *  Phase 5 — Operational: bi-directional event streaming
 */
@WebSocketGateway({
  port: parseInt(process.env.WS_PORT ?? '4001', 10),
  path: '/ws',
  cors: {
    origin: process.env.ALLOWED_ORIGINS?.split(',') ?? ['http://localhost:3000'],
    credentials: true,
  },
})
export class RealtimeGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(RealtimeGateway.name);

  /** socket.id → authenticated user context */
  private readonly connections = new Map<
    string,
    {
      userId: string;
      positionId: string | null;
      clearance: number;
      subscribedChannels: Set<string>;
    }
  >();

  constructor(
    private readonly jwtService: JwtService,
    private readonly registry: ConnectionRegistryService,
    private readonly chatService: ChatService,
    private readonly presenceService: PresenceService,
    private readonly callsService: CallsService,
    private readonly auditService: AuditService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  afterInit(server: Server): void {
    this.logger.log(`WebSocket gateway initialised on port ${process.env.WS_PORT ?? 4001}`);
  }

  // ─── Connection lifecycle ─────────────────────────────────────────────────────

  async handleConnection(client: WebSocket & { id: string }, req: any): Promise<void> {
    // Assign a stable socket ID
    client.id = `${INSTANCE_ID}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

    // Extract JWT — from Authorization header or query param `token`
    const token = this.extractToken(req);
    if (!token) {
      this.sendError(client, 'auth_required', 'Authentication token required');
      client.close(4001, 'auth_required');
      return;
    }

    let payload: { sub: string; positionId?: string; clearance?: number };
    try {
      payload = await this.jwtService.verifyAsync(token);
    } catch {
      this.sendError(client, 'auth_invalid', 'Token validation failed');
      client.close(4003, 'auth_invalid');
      await this.auditService.emit({
        eventType: 'GATEWAY_AUTH_FAILURE',
        resourceType: 'connection',
        resourceId: client.id,
        actorId: 'unknown',
        details: { ip: req.socket?.remoteAddress },
      });
      return;
    }

    const ctx = {
      userId: payload.sub,
      positionId: payload.positionId ?? null,
      clearance: payload.clearance ?? 0,
      subscribedChannels: new Set<string>(),
    };
    this.connections.set(client.id, ctx);

    // Register in Redis for multi-instance routing
    await this.registry.registerConnection(ctx.userId, client.id, INSTANCE_ID);

    // Set presence → ONLINE
    await this.presenceService.setPresence(ctx.userId, PresenceStatus.ONLINE);

    // Phase 4 — Send sync packet: unread counts + joined channels
    await this.sendSyncPacket(client, ctx);

    // Audit: connection established
    await this.auditService.emit({
      eventType: 'GATEWAY_CONNECTED',
      resourceType: 'connection',
      resourceId: client.id,
      actorId: ctx.userId,
      details: { ip: req.socket?.remoteAddress, instanceId: INSTANCE_ID },
    });

    this.logger.debug(`Client ${client.id} connected (user ${ctx.userId})`);
  }

  async handleDisconnect(client: WebSocket & { id: string }): Promise<void> {
    const ctx = this.connections.get(client.id);
    if (!ctx) return;

    // Unsubscribe from all channels
    for (const channelId of ctx.subscribedChannels) {
      await this.registry.unsubscribeFromChannel(channelId, ctx.userId);
    }

    await this.registry.deregisterConnection(ctx.userId, client.id);

    // Check if user still has other connections before setting OFFLINE
    const remaining = await this.registry.getConnections(ctx.userId);
    if (remaining.length === 0) {
      await this.presenceService.setPresence(ctx.userId, PresenceStatus.OFFLINE);
    }

    this.connections.delete(client.id);

    this.logger.debug(`Client ${client.id} disconnected (user ${ctx.userId})`);
  }

  // ─── Heartbeat (§7.2) ─────────────────────────────────────────────────────────

  @SubscribeMessage('heartbeat')
  async onHeartbeat(
    @ConnectedSocket() client: WebSocket & { id: string },
  ): Promise<WsResponse<{ ts: number }>> {
    const ctx = this.connections.get(client.id);
    if (!ctx) return { event: 'heartbeat_ack', data: { ts: Date.now() } };

    await this.registry.refreshConnection(ctx.userId, client.id);
    await this.presenceService.heartbeat(ctx.userId);

    return { event: 'heartbeat_ack', data: { ts: Date.now() } };
  }

  // ─── Presence (§7.1) ──────────────────────────────────────────────────────────

  @SubscribeMessage('presence.set')
  async onSetPresence(
    @ConnectedSocket() client: WebSocket & { id: string },
    @MessageBody() data: { status: PresenceStatus },
  ): Promise<void> {
    const ctx = this.connections.get(client.id);
    if (!ctx) return;
    await this.presenceService.setPresence(ctx.userId, data.status);
  }

  // ─── Subscribe to channel (§5.4) ─────────────────────────────────────────────

  @SubscribeMessage('channel.subscribe')
  async onChannelSubscribe(
    @ConnectedSocket() client: WebSocket & { id: string },
    @MessageBody() data: { channelId: string },
  ): Promise<WsResponse<{ ok: boolean }>> {
    const ctx = this.connections.get(client.id);
    if (!ctx) return { event: 'channel.subscribe_ack', data: { ok: false } };

    ctx.subscribedChannels.add(data.channelId);
    await this.registry.subscribeToChannel(data.channelId, ctx.userId);

    return { event: 'channel.subscribe_ack', data: { ok: true } };
  }

  @SubscribeMessage('channel.unsubscribe')
  async onChannelUnsubscribe(
    @ConnectedSocket() client: WebSocket & { id: string },
    @MessageBody() data: { channelId: string },
  ): Promise<void> {
    const ctx = this.connections.get(client.id);
    if (!ctx) return;
    ctx.subscribedChannels.delete(data.channelId);
    await this.registry.unsubscribeFromChannel(data.channelId, ctx.userId);
  }

  // ─── Typing indicators (§3.2 / ephemeral) ────────────────────────────────────

  @SubscribeMessage('typing.start')
  async onTypingStart(
    @ConnectedSocket() client: WebSocket & { id: string },
    @MessageBody() data: { channelId: string },
  ): Promise<void> {
    const ctx = this.connections.get(client.id);
    if (!ctx) return;

    await this.presenceService.setTyping(ctx.userId, data.channelId, true);

    // Broadcast to other channel members
    this.broadcastToChannel(
      data.channelId,
      { event: 'typing.started', data: { channelId: data.channelId, userId: ctx.userId } },
      client.id, // exclude sender
    );
  }

  @SubscribeMessage('typing.stop')
  async onTypingStop(
    @ConnectedSocket() client: WebSocket & { id: string },
    @MessageBody() data: { channelId: string },
  ): Promise<void> {
    const ctx = this.connections.get(client.id);
    if (!ctx) return;

    await this.presenceService.setTyping(ctx.userId, data.channelId, false);

    this.broadcastToChannel(
      data.channelId,
      { event: 'typing.stopped', data: { channelId: data.channelId, userId: ctx.userId } },
      client.id,
    );
  }

  // ─── Read receipts (§4.6) ─────────────────────────────────────────────────────

  @SubscribeMessage('read_receipt')
  async onReadReceipt(
    @ConnectedSocket() client: WebSocket & { id: string },
    @MessageBody() data: { channelId: string; lastReadSequence: number },
  ): Promise<void> {
    const ctx = this.connections.get(client.id);
    if (!ctx) return;

    await this.chatService.markRead(data.channelId, Number(data.lastReadSequence), ctx.positionId ?? ctx.userId);

    // Notify sender(s) of read receipt in DM channels
    this.eventEmitter.emit('chat.read_receipt', {
      channelId: data.channelId,
      userId: ctx.userId,
      lastReadSequence: data.lastReadSequence,
    });
  }

  // ─── Call signaling (§8.2) ───────────────────────────────────────────────────

  @SubscribeMessage('call.initiate')
  async onCallInitiate(
    @ConnectedSocket() client: WebSocket & { id: string },
    @MessageBody() data: { channelId: string; title?: string; classification?: number },
  ): Promise<WsResponse<{ sessionId?: string; error?: string }>> {
    const ctx = this.connections.get(client.id);
    if (!ctx) return { event: 'call.initiated', data: { error: 'not_authenticated' } };

    try {
      const session = await this.callsService.initiateCall(
        { channelId: data.channelId, title: data.title, classification: data.classification ?? 1 },
        ctx.userId,
        ctx.positionId ?? undefined,
        ctx.clearance,
      );

      return { event: 'call.initiated', data: { sessionId: session.id } };
    } catch (err) {
      return { event: 'call.initiated', data: { error: (err as Error).message } };
    }
  }

  @SubscribeMessage('call.accept')
  async onCallAccept(
    @ConnectedSocket() client: WebSocket & { id: string },
    @MessageBody() data: { sessionId: string },
  ): Promise<WsResponse<{ ok: boolean; error?: string }>> {
    const ctx = this.connections.get(client.id);
    if (!ctx) return { event: 'call.accepted', data: { ok: false, error: 'not_authenticated' } };

    try {
      await this.callsService.joinCall(data.sessionId, ctx.userId, ctx.positionId ?? undefined, ctx.clearance);
      return { event: 'call.accepted', data: { ok: true } };
    } catch (err) {
      return { event: 'call.accepted', data: { ok: false, error: (err as Error).message } };
    }
  }

  @SubscribeMessage('call.reject')
  async onCallReject(
    @ConnectedSocket() client: WebSocket & { id: string },
    @MessageBody() data: { sessionId: string },
  ): Promise<void> {
    const ctx = this.connections.get(client.id);
    if (!ctx) return;

    this.eventEmitter.emit('call.participant_rejected', {
      sessionId: data.sessionId,
      userId: ctx.userId,
    });
  }

  @SubscribeMessage('call.leave')
  async onCallLeave(
    @ConnectedSocket() client: WebSocket & { id: string },
    @MessageBody() data: { sessionId: string },
  ): Promise<void> {
    const ctx = this.connections.get(client.id);
    if (!ctx) return;
    await this.callsService.leaveCall(data.sessionId, ctx.userId);
  }

  /**
   * WebRTC SDP offer — forwarded to the SFU via the MediaCommandsService event bus.
   * The SFU replies with an SDP answer, which is delivered back through this gateway.
   */
  @SubscribeMessage('call.sdp_offer')
  async onSdpOffer(
    @ConnectedSocket() client: WebSocket & { id: string },
    @MessageBody() data: { sessionId: string; sdp: string },
  ): Promise<void> {
    const ctx = this.connections.get(client.id);
    if (!ctx) return;

    this.eventEmitter.emit('call.sdp_offer', {
      sessionId: data.sessionId,
      userId: ctx.userId,
      socketId: client.id,
      sdp: data.sdp,
    });
  }

  @SubscribeMessage('call.sdp_answer')
  async onSdpAnswer(
    @ConnectedSocket() client: WebSocket & { id: string },
    @MessageBody() data: { sessionId: string; sdp: string },
  ): Promise<void> {
    const ctx = this.connections.get(client.id);
    if (!ctx) return;

    this.eventEmitter.emit('call.sdp_answer', {
      sessionId: data.sessionId,
      userId: ctx.userId,
      socketId: client.id,
      sdp: data.sdp,
    });
  }

  @SubscribeMessage('call.ice_candidate')
  async onIceCandidate(
    @ConnectedSocket() client: WebSocket & { id: string },
    @MessageBody() data: { sessionId: string; candidate: unknown },
  ): Promise<void> {
    const ctx = this.connections.get(client.id);
    if (!ctx) return;

    this.eventEmitter.emit('call.ice_candidate', {
      sessionId: data.sessionId,
      userId: ctx.userId,
      socketId: client.id,
      candidate: data.candidate,
    });
  }

  // ─── Public delivery methods (called by RabbitMqGatewayConsumer) ─────────────

  /**
   * Deliver an event to all local sockets subscribed to a channel.
   */
  deliverToChannel(channelId: string, payload: object, excludeSocketId?: string): void {
    let delivered = 0;
    for (const [socketId, ctx] of this.connections) {
      if (excludeSocketId && socketId === excludeSocketId) continue;
      if (!ctx.subscribedChannels.has(channelId)) continue;
      this.sendToSocket(socketId, payload);
      delivered++;
    }
    if (delivered > 0) {
      this.logger.debug(`Delivered event to ${delivered} client(s) in channel ${channelId}`);
    }
  }

  /**
   * Deliver an event to a specific user (all their sockets on this instance).
   */
  deliverToUser(userId: string, payload: object): void {
    for (const [socketId, ctx] of this.connections) {
      if (ctx.userId === userId) {
        this.sendToSocket(socketId, payload);
      }
    }
  }

  // ─── Private helpers ──────────────────────────────────────────────────────────

  /**
   * Phase 4 state synchronisation — send unread counts and channel list on connect.
   */
  private async sendSyncPacket(
    client: WebSocket & { id: string },
    ctx: { userId: string; positionId: string | null; clearance: number; subscribedChannels: Set<string> },
  ): Promise<void> {
    try {
      const channels = await this.chatService.listChannels(ctx.userId, ctx.clearance);

      // Subscribe client to all their channels automatically
      for (const ch of channels) {
        ctx.subscribedChannels.add(ch.id);
        await this.registry.subscribeToChannel(ch.id, ctx.userId);
      }

      // Compute unread counts per channel using the caller's position id
      const unreadEntries = await Promise.all(
        channels.map(async (ch) => {
          const count = ctx.positionId
            ? await this.chatService.getUnreadCount(ch.id, ctx.positionId).catch(() => 0)
            : 0;
          return [ch.id, count] as const;
        }),
      );
      const unreadCounts = Object.fromEntries(unreadEntries);

      this.sendToClient(client, {
        event: 'sync',
        data: {
          channels: channels.map((c) => ({
            id: c.id,
            name: c.name,
            type: c.type,
            status: c.status,
            classification: c.classification,
          })),
          unreadCounts,
          presence: PresenceStatus.ONLINE,
          ts: Date.now(),
        },
      });
    } catch (err) {
      this.logger.warn(
        `Sync packet failed for ${ctx.userId}: ${(err as Error).message}`,
      );
    }
  }

  private broadcastToChannel(
    channelId: string,
    payload: object,
    excludeSocketId?: string,
  ): void {
    for (const [socketId, ctx] of this.connections) {
      if (excludeSocketId && socketId === excludeSocketId) continue;
      if (ctx.subscribedChannels.has(channelId)) {
        this.sendToSocket(socketId, payload);
      }
    }
  }

  private sendToSocket(socketId: string, payload: object): void {
    // Iterate WS server's clients to find by id
    if (!this.server) return;
    this.server.clients.forEach((ws: any) => {
      if (ws.id === socketId && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(payload));
      }
    });
  }

  private sendToClient(client: WebSocket, payload: object): void {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(payload));
    }
  }

  private sendError(client: WebSocket, code: string, message: string): void {
    this.sendToClient(client, { event: 'error', data: { code, message } });
  }

  private extractToken(req: any): string | null {
    // 1. Authorization header: "Bearer <token>"
    const authHeader = req?.headers?.authorization as string | undefined;
    if (authHeader?.startsWith('Bearer ')) {
      return authHeader.slice(7);
    }

    // 2. URL query param ?token=...
    const url = req?.url as string | undefined;
    if (url) {
      const tokenMatch = url.match(/[?&]token=([^&]+)/);
      if (tokenMatch) return decodeURIComponent(tokenMatch[1]);
    }

    return null;
  }
}
