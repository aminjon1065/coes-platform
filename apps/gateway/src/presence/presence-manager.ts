import { Redis } from 'ioredis';

const PRESENCE_TTL = 90; // seconds — refreshed on heartbeat
const KEY = (userId: string) => `presence:${userId}`;

export type PresenceStatus = 'online' | 'away' | 'offline';

export class PresenceManager {
  constructor(private readonly redis: Redis) {}

  async setOnline(userId: string): Promise<void> {
    await this.redis.setex(KEY(userId), PRESENCE_TTL, 'online');
  }

  async setAway(userId: string): Promise<void> {
    await this.redis.setex(KEY(userId), PRESENCE_TTL, 'away');
  }

  async setOffline(userId: string): Promise<void> {
    await this.redis.del(KEY(userId));
  }

  async getStatus(userId: string): Promise<PresenceStatus> {
    const val = await this.redis.get(KEY(userId));
    if (!val) return 'offline';
    return val as PresenceStatus;
  }

  async getBulkStatus(userIds: string[]): Promise<Map<string, PresenceStatus>> {
    if (userIds.length === 0) return new Map();

    const keys = userIds.map(KEY);
    const values = await this.redis.mget(...keys);

    return new Map(
      userIds.map((id, i) => [id, (values[i] as PresenceStatus | null) ?? 'offline']),
    );
  }
}
