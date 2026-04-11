import { Injectable, Logger, Inject } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';

/**
 * Redis-backed connection registry (§5.3).
 *
 * Stores ephemeral mappings needed for multi-instance gateway fan-out:
 *   user_id  → set of { socketId, instanceId }
 *   channel_id → set of user_ids currently subscribed
 *
 * All values have short TTLs — they are refreshed by heartbeats and
 * automatically expire if a gateway instance crashes without clean shutdown.
 *
 * For Phase 1 (single instance), the in-memory Map inside the gateway
 * is the source of truth for socket handles. Redis provides the routing
 * tables that would be needed for multi-instance fan-out.
 */
@Injectable()
export class ConnectionRegistryService {
  private readonly logger = new Logger(ConnectionRegistryService.name);

  /** Connection record TTL — 90 s (heartbeat refreshes every 30 s) */
  private static readonly CONN_TTL = 90_000; // ms (cache-manager v5)

  /** Channel subscription set TTL */
  private static readonly CHAN_TTL = 90_000;

  constructor(
    @Inject(CACHE_MANAGER)
    private readonly cache: Cache,
  ) {}

  // ─── User ↔ Connection mapping ───────────────────────────────────────────────

  async registerConnection(
    userId: string,
    socketId: string,
    instanceId: string,
  ): Promise<void> {
    const key = this.userConnectionsKey(userId);
    const existing = await this.getConnections(userId);
    const updated = existing.filter((c) => c.socketId !== socketId);
    updated.push({ socketId, instanceId, connectedAt: Date.now() });
    await this.cache.set(key, JSON.stringify(updated), ConnectionRegistryService.CONN_TTL);
  }

  async deregisterConnection(userId: string, socketId: string): Promise<void> {
    const existing = await this.getConnections(userId);
    const updated = existing.filter((c) => c.socketId !== socketId);
    if (updated.length === 0) {
      await this.cache.del(this.userConnectionsKey(userId));
    } else {
      await this.cache.set(
        this.userConnectionsKey(userId),
        JSON.stringify(updated),
        ConnectionRegistryService.CONN_TTL,
      );
    }
  }

  async getConnections(
    userId: string,
  ): Promise<Array<{ socketId: string; instanceId: string; connectedAt: number }>> {
    const raw = await this.cache.get<string>(this.userConnectionsKey(userId));
    if (!raw) return [];
    try {
      return JSON.parse(raw);
    } catch {
      return [];
    }
  }

  async isUserOnline(userId: string): Promise<boolean> {
    const conns = await this.getConnections(userId);
    return conns.length > 0;
  }

  async refreshConnection(userId: string, socketId: string): Promise<void> {
    const existing = await this.getConnections(userId);
    const conn = existing.find((c) => c.socketId === socketId);
    if (conn) {
      conn.connectedAt = Date.now(); // reset effectively
      await this.cache.set(
        this.userConnectionsKey(userId),
        JSON.stringify(existing),
        ConnectionRegistryService.CONN_TTL,
      );
    }
  }

  // ─── Channel ↔ User subscription mapping ─────────────────────────────────────

  async subscribeToChannel(channelId: string, userId: string): Promise<void> {
    const key = this.channelUsersKey(channelId);
    const existing = await this.getChannelUsers(channelId);
    if (!existing.includes(userId)) {
      existing.push(userId);
      await this.cache.set(key, JSON.stringify(existing), ConnectionRegistryService.CHAN_TTL);
    }
  }

  async unsubscribeFromChannel(channelId: string, userId: string): Promise<void> {
    const updated = (await this.getChannelUsers(channelId)).filter((id) => id !== userId);
    if (updated.length === 0) {
      await this.cache.del(this.channelUsersKey(channelId));
    } else {
      await this.cache.set(
        this.channelUsersKey(channelId),
        JSON.stringify(updated),
        ConnectionRegistryService.CHAN_TTL,
      );
    }
  }

  async getChannelUsers(channelId: string): Promise<string[]> {
    const raw = await this.cache.get<string>(this.channelUsersKey(channelId));
    if (!raw) return [];
    try {
      return JSON.parse(raw);
    } catch {
      return [];
    }
  }

  async refreshChannelSubscription(channelId: string, userId: string): Promise<void> {
    const users = await this.getChannelUsers(channelId);
    if (users.includes(userId)) {
      await this.cache.set(
        this.channelUsersKey(channelId),
        JSON.stringify(users),
        ConnectionRegistryService.CHAN_TTL,
      );
    }
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────────

  private userConnectionsKey(userId: string): string {
    return `gateway:conn:${userId}`;
  }

  private channelUsersKey(channelId: string): string {
    return `gateway:chan:${channelId}`;
  }
}
