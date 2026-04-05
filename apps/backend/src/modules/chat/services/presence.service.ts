import { Injectable, Logger, Inject } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { EventEmitter2 } from '@nestjs/event-emitter';

export enum PresenceStatus {
  ONLINE = 'online',
  AWAY = 'away',
  BUSY = 'busy',
  OFFLINE = 'offline',
}

export interface PresenceState {
  userId: string;
  status: PresenceStatus;
  lastSeen: string; // ISO timestamp
  currentDevice?: string;
}

const PRESENCE_KEY_PREFIX = 'presence:';
const PRESENCE_TTL_SECONDS = 120; // Heartbeat must arrive within 2 minutes or user is OFFLINE
const LAST_SEEN_KEY_PREFIX = 'presence:last_seen:';
const LAST_SEEN_TTL_SECONDS = 86_400 * 7; // 7 days

/**
 * 2.5 — Redis-backed user presence tracking.
 *
 * Presence state is stored in Redis (ephemeral, short TTL).
 * The Real-time Gateway calls setPresence() on connect/heartbeat/disconnect.
 * All presence changes are published as events for the Gateway to fan-out.
 */
@Injectable()
export class PresenceService {
  private readonly logger = new Logger(PresenceService.name);

  constructor(
    @Inject(CACHE_MANAGER)
    private readonly cache: Cache,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  // ─── Set / update ────────────────────────────────────────────────────────────

  async setPresence(
    userId: string,
    status: PresenceStatus,
    device?: string,
  ): Promise<void> {
    const prev = await this.getPresence(userId);

    const state: PresenceState = {
      userId,
      status,
      lastSeen: new Date().toISOString(),
      currentDevice: device,
    };

    if (status === PresenceStatus.OFFLINE) {
      // On disconnect: remove online state, update last_seen persistently
      await this.cache.del(`${PRESENCE_KEY_PREFIX}${userId}`);
      await this.cache.set(
        `${LAST_SEEN_KEY_PREFIX}${userId}`,
        state.lastSeen,
        LAST_SEEN_TTL_SECONDS,
      );
    } else {
      await this.cache.set(
        `${PRESENCE_KEY_PREFIX}${userId}`,
        JSON.stringify(state),
        PRESENCE_TTL_SECONDS,
      );
    }

    // Emit only if status actually changed
    if (!prev || prev.status !== status) {
      this.eventEmitter.emit('presence.changed', {
        userId,
        from: prev?.status ?? PresenceStatus.OFFLINE,
        to: status,
      });
    }
  }

  /**
   * Heartbeat — refreshes TTL without changing status.
   * Called by the WebSocket gateway on each client ping.
   */
  async heartbeat(userId: string): Promise<void> {
    const raw = await this.cache.get<string>(`${PRESENCE_KEY_PREFIX}${userId}`);
    if (!raw) {
      // Treat expired presence as reconnect
      await this.setPresence(userId, PresenceStatus.ONLINE);
      return;
    }
    const state: PresenceState = JSON.parse(raw);
    state.lastSeen = new Date().toISOString();
    await this.cache.set(
      `${PRESENCE_KEY_PREFIX}${userId}`,
      JSON.stringify(state),
      PRESENCE_TTL_SECONDS,
    );
  }

  // ─── Query ───────────────────────────────────────────────────────────────────

  async getPresence(userId: string): Promise<PresenceState | null> {
    const raw = await this.cache.get<string>(`${PRESENCE_KEY_PREFIX}${userId}`);
    if (!raw) {
      const lastSeen = await this.cache.get<string>(`${LAST_SEEN_KEY_PREFIX}${userId}`);
      if (!lastSeen) return null;
      return {
        userId,
        status: PresenceStatus.OFFLINE,
        lastSeen,
      };
    }
    return JSON.parse(raw);
  }

  async getBulkPresence(userIds: string[]): Promise<Map<string, PresenceState>> {
    const result = new Map<string, PresenceState>();
    await Promise.all(
      userIds.map(async (uid) => {
        const state = await this.getPresence(uid);
        if (state) result.set(uid, state);
        else result.set(uid, { userId: uid, status: PresenceStatus.OFFLINE, lastSeen: '' });
      }),
    );
    return result;
  }

  // ─── Typing indicators ───────────────────────────────────────────────────────

  /**
   * 2.5.2 — Ephemeral typing indicators (Redis TTL, never persisted).
   */
  async setTyping(channelId: string, userId: string, isTyping: boolean): Promise<void> {
    const key = `typing:${channelId}:${userId}`;
    if (isTyping) {
      await this.cache.set(key, '1', 5); // 5 second TTL
      this.eventEmitter.emit('chat.typing_started', { channelId, userId });
    } else {
      await this.cache.del(key);
      this.eventEmitter.emit('chat.typing_stopped', { channelId, userId });
    }
  }

  async getTypingUsers(channelId: string): Promise<string[]> {
    // Note: cache-manager doesn't support key scanning directly.
    // In a production implementation, maintain a Redis set of typing users per channel.
    // This returns empty — the real-time gateway handles ephemeral typing state in-memory.
    return [];
  }
}
