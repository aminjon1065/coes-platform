import { Test, TestingModule } from '@nestjs/testing';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  PresenceService,
  PresenceStatus,
  PresenceState,
} from './presence.service';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeState(
  userId: string,
  status: PresenceStatus,
  device?: string,
): PresenceState {
  return { userId, status, lastSeen: new Date().toISOString(), currentDevice: device };
}

// ─── Constants duplicated from the SUT (no re-export, so we mirror them) ─────

const PRESENCE_KEY_PREFIX   = 'presence:';
const LAST_SEEN_KEY_PREFIX  = 'presence:last_seen:';
const PRESENCE_TTL_SECONDS  = 120;
const LAST_SEEN_TTL_SECONDS = 86_400 * 7;

// ─── Suite ───────────────────────────────────────────────────────────────────

describe('PresenceService', () => {
  let service: PresenceService;

  const mockCache = {
    get: jest.fn(),
    set: jest.fn(),
    del: jest.fn(),
  };

  const mockEmitter = {
    emit: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PresenceService,
        { provide: CACHE_MANAGER, useValue: mockCache },
        { provide: EventEmitter2, useValue: mockEmitter },
      ],
    }).compile();

    service = module.get<PresenceService>(PresenceService);
  });

  // ── setPresence ─────────────────────────────────────────────────────────────

  describe('setPresence', () => {
    it('stores serialised state in cache with PRESENCE_TTL when status is ONLINE', async () => {
      mockCache.get.mockResolvedValue(null); // no prior state

      await service.setPresence('u1', PresenceStatus.ONLINE, 'desktop');

      expect(mockCache.set).toHaveBeenCalledWith(
        `${PRESENCE_KEY_PREFIX}u1`,
        expect.stringContaining('"status":"online"'),
        PRESENCE_TTL_SECONDS,
      );
      expect(mockCache.del).not.toHaveBeenCalled();
    });

    it('stores AWAY state with correct TTL', async () => {
      mockCache.get.mockResolvedValue(null);

      await service.setPresence('u1', PresenceStatus.AWAY);

      expect(mockCache.set).toHaveBeenCalledWith(
        `${PRESENCE_KEY_PREFIX}u1`,
        expect.stringContaining('"status":"away"'),
        PRESENCE_TTL_SECONDS,
      );
    });

    it('stores BUSY state with correct TTL', async () => {
      mockCache.get.mockResolvedValue(null);

      await service.setPresence('u1', PresenceStatus.BUSY);

      expect(mockCache.set).toHaveBeenCalledWith(
        `${PRESENCE_KEY_PREFIX}u1`,
        expect.stringContaining('"status":"busy"'),
        PRESENCE_TTL_SECONDS,
      );
    });

    it('removes presence key and persists last_seen with long TTL when OFFLINE', async () => {
      mockCache.get.mockResolvedValue(
        JSON.stringify(makeState('u1', PresenceStatus.ONLINE)),
      );

      await service.setPresence('u1', PresenceStatus.OFFLINE);

      expect(mockCache.del).toHaveBeenCalledWith(`${PRESENCE_KEY_PREFIX}u1`);
      expect(mockCache.set).toHaveBeenCalledWith(
        `${LAST_SEEN_KEY_PREFIX}u1`,
        expect.any(String),
        LAST_SEEN_TTL_SECONDS,
      );
    });

    it('emits presence.changed when status transitions from null to ONLINE', async () => {
      // First cache.get (getPresence -> presence key) → null
      // Second cache.get (getPresence -> last_seen key) → null
      mockCache.get.mockResolvedValueOnce(null).mockResolvedValueOnce(null);

      await service.setPresence('u1', PresenceStatus.ONLINE);

      expect(mockEmitter.emit).toHaveBeenCalledWith('presence.changed', {
        userId: 'u1',
        from: PresenceStatus.OFFLINE,
        to: PresenceStatus.ONLINE,
      });
    });

    it('emits presence.changed when status changes from ONLINE to AWAY', async () => {
      const existing = makeState('u1', PresenceStatus.ONLINE);
      mockCache.get.mockResolvedValueOnce(JSON.stringify(existing));

      await service.setPresence('u1', PresenceStatus.AWAY);

      expect(mockEmitter.emit).toHaveBeenCalledWith('presence.changed', {
        userId: 'u1',
        from: PresenceStatus.ONLINE,
        to: PresenceStatus.AWAY,
      });
    });

    it('does NOT emit when status is unchanged', async () => {
      const existing = makeState('u1', PresenceStatus.ONLINE);
      mockCache.get.mockResolvedValueOnce(JSON.stringify(existing));

      await service.setPresence('u1', PresenceStatus.ONLINE);

      expect(mockEmitter.emit).not.toHaveBeenCalled();
    });
  });

  // ── heartbeat ───────────────────────────────────────────────────────────────

  describe('heartbeat', () => {
    it('refreshes TTL by re-writing existing state with PRESENCE_TTL', async () => {
      const existing = makeState('u1', PresenceStatus.ONLINE);
      mockCache.get.mockResolvedValueOnce(JSON.stringify(existing));

      await service.heartbeat('u1');

      expect(mockCache.set).toHaveBeenCalledWith(
        `${PRESENCE_KEY_PREFIX}u1`,
        expect.stringContaining('"userId":"u1"'),
        PRESENCE_TTL_SECONDS,
      );
    });

    it('updates lastSeen timestamp on heartbeat', async () => {
      const existing = makeState('u1', PresenceStatus.ONLINE);
      existing.lastSeen = '2020-01-01T00:00:00.000Z';
      mockCache.get.mockResolvedValueOnce(JSON.stringify(existing));

      const before = Date.now();
      await service.heartbeat('u1');
      const after = Date.now();

      const [, serialised] = mockCache.set.mock.calls[0] as [string, string, number];
      const saved: PresenceState = JSON.parse(serialised);
      const savedMs = new Date(saved.lastSeen).getTime();
      expect(savedMs).toBeGreaterThanOrEqual(before);
      expect(savedMs).toBeLessThanOrEqual(after);
    });

    it('calls setPresence(ONLINE) when presence key has expired (cache miss)', async () => {
      // heartbeat reads presence key → null
      // then setPresence calls getPresence internally → presence key null, last_seen null
      mockCache.get
        .mockResolvedValueOnce(null)   // heartbeat: presence key miss
        .mockResolvedValueOnce(null)   // setPresence->getPresence: presence key
        .mockResolvedValueOnce(null);  // setPresence->getPresence: last_seen key

      await service.heartbeat('u1');

      expect(mockCache.set).toHaveBeenCalledWith(
        `${PRESENCE_KEY_PREFIX}u1`,
        expect.stringContaining('"status":"online"'),
        PRESENCE_TTL_SECONDS,
      );
    });
  });

  // ── getPresence ─────────────────────────────────────────────────────────────

  describe('getPresence', () => {
    it('returns parsed PresenceState when presence key exists', async () => {
      const existing = makeState('u1', PresenceStatus.BUSY, 'mobile');
      mockCache.get.mockResolvedValueOnce(JSON.stringify(existing));

      const result = await service.getPresence('u1');

      expect(result).toMatchObject({ userId: 'u1', status: PresenceStatus.BUSY });
    });

    it('returns OFFLINE state with lastSeen when only last_seen key exists', async () => {
      const lastSeen = '2024-06-01T10:00:00.000Z';
      mockCache.get
        .mockResolvedValueOnce(null)     // presence key miss
        .mockResolvedValueOnce(lastSeen); // last_seen key hit

      const result = await service.getPresence('u1');

      expect(result).toEqual({ userId: 'u1', status: PresenceStatus.OFFLINE, lastSeen });
    });

    it('returns null when both presence and last_seen keys are missing', async () => {
      mockCache.get.mockResolvedValue(null);

      const result = await service.getPresence('unknownUser');

      expect(result).toBeNull();
    });
  });

  // ── getBulkPresence ─────────────────────────────────────────────────────────

  describe('getBulkPresence', () => {
    it('returns a Map with an entry for every requested userId', async () => {
      mockCache.get.mockResolvedValue(null);

      const result = await service.getBulkPresence(['u1', 'u2', 'u3']);

      expect(result.size).toBe(3);
      expect(result.has('u1')).toBe(true);
      expect(result.has('u2')).toBe(true);
      expect(result.has('u3')).toBe(true);
    });

    it('returns real state for found users and OFFLINE placeholder for unfound users', async () => {
      const onlineState = makeState('u1', PresenceStatus.ONLINE);
      // u1: presence key hit; u2: both misses
      mockCache.get
        .mockResolvedValueOnce(JSON.stringify(onlineState)) // u1 presence key
        .mockResolvedValueOnce(null)                        // u2 presence key
        .mockResolvedValueOnce(null);                       // u2 last_seen key

      const result = await service.getBulkPresence(['u1', 'u2']);

      expect(result.get('u1')!.status).toBe(PresenceStatus.ONLINE);
      expect(result.get('u2')!.status).toBe(PresenceStatus.OFFLINE);
      expect(result.get('u2')!.lastSeen).toBe('');
    });

    it('returns empty Map for empty input', async () => {
      const result = await service.getBulkPresence([]);

      expect(result.size).toBe(0);
    });
  });

  // ── setTyping ───────────────────────────────────────────────────────────────

  describe('setTyping', () => {
    it('stores typing indicator in cache with 5-second TTL when isTyping=true', async () => {
      await service.setTyping('ch1', 'u1', true);

      expect(mockCache.set).toHaveBeenCalledWith('typing:ch1:u1', '1', 5);
    });

    it('emits chat.typing_started when isTyping=true', async () => {
      await service.setTyping('ch1', 'u1', true);

      expect(mockEmitter.emit).toHaveBeenCalledWith('chat.typing_started', {
        channelId: 'ch1',
        userId: 'u1',
      });
    });

    it('deletes cache key when isTyping=false', async () => {
      await service.setTyping('ch1', 'u1', false);

      expect(mockCache.del).toHaveBeenCalledWith('typing:ch1:u1');
      expect(mockCache.set).not.toHaveBeenCalled();
    });

    it('emits chat.typing_stopped when isTyping=false', async () => {
      await service.setTyping('ch1', 'u1', false);

      expect(mockEmitter.emit).toHaveBeenCalledWith('chat.typing_stopped', {
        channelId: 'ch1',
        userId: 'u1',
      });
    });
  });

  // ── getTypingUsers ──────────────────────────────────────────────────────────

  describe('getTypingUsers', () => {
    it('returns an array (current implementation returns empty — gateway owns in-memory state)', async () => {
      const result = await service.getTypingUsers('ch1');

      expect(Array.isArray(result)).toBe(true);
    });

    it('returns empty array regardless of channel', async () => {
      const result = await service.getTypingUsers('any-channel');

      expect(result).toHaveLength(0);
    });
  });
});
