/**
 * 1.8.5 — Gateway WebSocket server tests
 *
 * Tests the GatewayServer class in isolation by mocking:
 * - WebSocketServer (ws)
 * - Redis (ioredis)
 * - JWT validation
 * - PresenceManager
 */
import { WebSocket, WebSocketServer } from 'ws';
import { GatewayServer, ConnectedClient } from './gateway';

// ── Mock dependencies ────────────────────────────────────────────────────────

jest.mock('ioredis', () => {
  return {
    Redis: jest.fn().mockImplementation(() => ({
      connect: jest.fn().mockResolvedValue(undefined),
      quit: jest.fn().mockResolvedValue(undefined),
      setex: jest.fn().mockResolvedValue('OK'),
      del: jest.fn().mockResolvedValue(1),
      get: jest.fn().mockResolvedValue(null),
      mget: jest.fn().mockResolvedValue([]),
    })),
  };
});

jest.mock('amqplib', () => ({
  connect: jest.fn().mockRejectedValue(new Error('No AMQP in tests')),
}));

jest.mock('./auth/token-validator', () => ({
  validateAccessToken: jest.fn(),
  extractBearerToken: jest.fn((h?: string) => (h?.startsWith('Bearer ') ? h.slice(7) : null)),
}));

jest.mock('./presence/presence-manager', () => ({
  PresenceManager: jest.fn().mockImplementation(() => ({
    setOnline:  jest.fn().mockResolvedValue(undefined),
    setOffline: jest.fn().mockResolvedValue(undefined),
    setAway:    jest.fn().mockResolvedValue(undefined),
    getStatus:  jest.fn().mockResolvedValue('offline'),
    getBulkStatus: jest.fn().mockResolvedValue(new Map()),
  })),
}));

import { validateAccessToken } from './auth/token-validator';

// ── Helpers ──────────────────────────────────────────────────────────────────

const VALID_CLAIMS = { sub: 'user-1', username: 'ahmad.k', iat: 1000, exp: 9999999999 };

/** Build a mock WebSocket with event-listener support */
function makeMockSocket(): jest.Mocked<WebSocket> & { _emit: (event: string, ...args: any[]) => void } {
  const listeners: Record<string, ((...args: any[]) => void)[]> = {};
  const ws = {
    readyState: WebSocket.OPEN,
    send: jest.fn(),
    close: jest.fn(),
    on: jest.fn((event: string, cb: (...args: any[]) => void) => {
      listeners[event] = listeners[event] ?? [];
      listeners[event].push(cb);
    }),
    _emit: (event: string, ...args: any[]) => {
      (listeners[event] ?? []).forEach((cb) => cb(...args));
    },
  };
  return ws as any;
}

/** Build a mock IncomingMessage with optional URL and Authorization header */
function makeMockReq(opts: { url?: string; auth?: string } = {}) {
  return {
    url: opts.url ?? '/',
    headers: opts.auth ? { authorization: opts.auth } : {},
  } as any;
}

/** Simulate a WebSocket connection event on the mock WSS */
function simulateConnection(wss: any, socket: any, req: any) {
  const [[, handler]] = (wss.on as jest.Mock).mock.calls.filter(([e]: any) => e === 'connection');
  handler(socket, req);
}

/** Build a GatewayServer with a mock WSS */
function makeGateway() {
  const wss = { on: jest.fn() } as unknown as WebSocketServer;
  process.env.JWT_ACCESS_SECRET = 'test-secret';
  const gw = new GatewayServer(wss);
  return { gw, wss };
}

// ── Suite ────────────────────────────────────────────────────────────────────

describe('GatewayServer', () => {
  let gw: GatewayServer;
  let wss: WebSocketServer;

  beforeEach(async () => {
    jest.clearAllMocks();
    ({ gw, wss } = makeGateway());
    await gw.start();
  });

  afterEach(async () => {
    await gw.stop();
  });

  // ── Connection handling ────────────────────────────────────────────────────

  describe('handleConnection', () => {
    it('closes with 4001 when no token is provided', () => {
      const socket = makeMockSocket();
      simulateConnection(wss, socket, makeMockReq());

      expect(socket.close).toHaveBeenCalledWith(4001, 'Authentication required');
    });

    it('closes with 4003 when token is invalid', () => {
      (validateAccessToken as jest.Mock).mockImplementationOnce(() => {
        throw new Error('jwt expired');
      });

      const socket = makeMockSocket();
      simulateConnection(wss, socket, makeMockReq({ auth: 'Bearer bad-token' }));

      expect(socket.close).toHaveBeenCalledWith(4003, 'Invalid or expired token');
    });

    it('accepts connection and sends `connected` ack with a connId', () => {
      (validateAccessToken as jest.Mock).mockReturnValueOnce(VALID_CLAIMS);

      const socket = makeMockSocket();
      simulateConnection(wss, socket, makeMockReq({ auth: 'Bearer valid' }));

      expect(socket.close).not.toHaveBeenCalled();
      expect(socket.send).toHaveBeenCalledTimes(1);
      const msg = JSON.parse((socket.send as jest.Mock).mock.calls[0][0]);
      expect(msg.type).toBe('connected');
      expect(msg.payload.connId).toBeDefined();
    });

    it('extracts token from query string when no Authorization header', () => {
      (validateAccessToken as jest.Mock).mockReturnValueOnce(VALID_CLAIMS);

      const socket = makeMockSocket();
      simulateConnection(wss, socket, makeMockReq({ url: '/?token=qs-token' }));

      expect(validateAccessToken).toHaveBeenCalledWith('qs-token');
      expect(socket.close).not.toHaveBeenCalled();
    });

    it('sets user presence online on connect', async () => {
      (validateAccessToken as jest.Mock).mockReturnValueOnce(VALID_CLAIMS);
      const socket = makeMockSocket();
      simulateConnection(wss, socket, makeMockReq({ auth: 'Bearer valid' }));

      // Allow async presence call to resolve
      await Promise.resolve();

      const { PresenceManager } = require('./presence/presence-manager');
      const presence = PresenceManager.mock.results[0].value;
      expect(presence.setOnline).toHaveBeenCalledWith(VALID_CLAIMS.sub);
    });
  });

  // ── Message handling ───────────────────────────────────────────────────────

  describe('handleMessage', () => {
    function connectUser(userId = VALID_CLAIMS.sub) {
      (validateAccessToken as jest.Mock).mockReturnValueOnce({ ...VALID_CLAIMS, sub: userId });
      const socket = makeMockSocket();
      simulateConnection(wss, socket, makeMockReq({ auth: 'Bearer valid' }));
      return socket;
    }

    it('responds to ping with pong including timestamp', () => {
      const socket = connectUser();
      socket._emit('message', JSON.stringify({ type: 'ping' }));

      const calls = (socket.send as jest.Mock).mock.calls.map(([d]: any) => JSON.parse(d));
      const pong = calls.find((m: any) => m.type === 'pong');
      expect(pong).toBeDefined();
      expect(typeof pong.payload.ts).toBe('number');
    });

    it('adds room and sends room_joined on join_room', () => {
      const socket = connectUser();
      socket._emit('message', JSON.stringify({ type: 'join_room', payload: { roomId: 'room-42' } }));

      const calls = (socket.send as jest.Mock).mock.calls.map(([d]: any) => JSON.parse(d));
      const roomJoined = calls.find((m: any) => m.type === 'room_joined');
      expect(roomJoined).toBeDefined();
      expect(roomJoined.payload.roomId).toBe('room-42');
    });

    it('sends error response for malformed JSON', () => {
      const socket = connectUser();
      socket._emit('message', 'not-json!!!');

      const calls = (socket.send as jest.Mock).mock.calls.map(([d]: any) => JSON.parse(d));
      const errMsg = calls.find((m: any) => m.type === 'error');
      expect(errMsg).toBeDefined();
      expect(errMsg.payload.message).toMatch(/invalid json/i);
    });

    it('removes room on leave_room', () => {
      const socket = connectUser();
      socket._emit('message', JSON.stringify({ type: 'join_room', payload: { roomId: 'room-99' } }));
      socket._emit('message', JSON.stringify({ type: 'leave_room', payload: { roomId: 'room-99' } }));

      // After leave, broadcasting to room-99 should not reach this socket
      gw.broadcastToRoom('room-99', { type: 'test' });
      // socket.send was called for: connected + room_joined only (not broadcast)
      const calls = (socket.send as jest.Mock).mock.calls.map(([d]: any) => JSON.parse(d));
      expect(calls.find((m: any) => m.type === 'test')).toBeUndefined();
    });
  });

  // ── Broadcasting ───────────────────────────────────────────────────────────

  describe('broadcastToRoom', () => {
    it('sends event only to clients in the room', () => {
      (validateAccessToken as jest.Mock)
        .mockReturnValueOnce({ ...VALID_CLAIMS, sub: 'user-a' })
        .mockReturnValueOnce({ ...VALID_CLAIMS, sub: 'user-b' });

      const socketA = makeMockSocket();
      const socketB = makeMockSocket();

      simulateConnection(wss, socketA, makeMockReq({ auth: 'Bearer t1' }));
      simulateConnection(wss, socketB, makeMockReq({ auth: 'Bearer t2' }));

      // Only A joins the room
      socketA._emit('message', JSON.stringify({ type: 'join_room', payload: { roomId: 'channel-5' } }));

      jest.clearAllMocks();
      gw.broadcastToRoom('channel-5', { type: 'new_message', payload: { text: 'Hello' } });

      expect(socketA.send).toHaveBeenCalledTimes(1);
      expect(socketB.send).not.toHaveBeenCalled();
    });

    it('does not send to CLOSED sockets', () => {
      (validateAccessToken as jest.Mock).mockReturnValueOnce(VALID_CLAIMS);
      const socket = makeMockSocket();
      simulateConnection(wss, socket, makeMockReq({ auth: 'Bearer valid' }));
      socket._emit('message', JSON.stringify({ type: 'join_room', payload: { roomId: 'room-x' } }));

      // Mark socket as closed
      (socket as any).readyState = WebSocket.CLOSED;
      jest.clearAllMocks();

      gw.broadcastToRoom('room-x', { type: 'event' });

      expect(socket.send).not.toHaveBeenCalled();
    });
  });

  // ── sendToUser ─────────────────────────────────────────────────────────────

  describe('sendToUser', () => {
    it('delivers event to all open connections of a user', () => {
      // Two connections from the same user
      (validateAccessToken as jest.Mock)
        .mockReturnValue(VALID_CLAIMS); // same claims for both

      const s1 = makeMockSocket();
      const s2 = makeMockSocket();
      simulateConnection(wss, s1, makeMockReq({ auth: 'Bearer t1' }));
      simulateConnection(wss, s2, makeMockReq({ auth: 'Bearer t2' }));

      jest.clearAllMocks();
      gw.sendToUser(VALID_CLAIMS.sub, { type: 'notification', payload: { msg: 'Hi' } });

      expect(s1.send).toHaveBeenCalledTimes(1);
      expect(s2.send).toHaveBeenCalledTimes(1);
    });

    it('is a no-op when user has no active connections', () => {
      expect(() => gw.sendToUser('unknown-user', { type: 'test' })).not.toThrow();
    });
  });

  // ── Disconnect handling ────────────────────────────────────────────────────

  describe('handleDisconnect', () => {
    it('removes client from maps and sets presence offline when last connection closes', async () => {
      (validateAccessToken as jest.Mock).mockReturnValueOnce(VALID_CLAIMS);
      const socket = makeMockSocket();
      simulateConnection(wss, socket, makeMockReq({ auth: 'Bearer valid' }));

      await Promise.resolve(); // let setOnline resolve

      socket._emit('close');
      await Promise.resolve(); // let setOffline resolve

      const { PresenceManager } = require('./presence/presence-manager');
      const presence = PresenceManager.mock.results[0].value;
      expect(presence.setOffline).toHaveBeenCalledWith(VALID_CLAIMS.sub);

      // After disconnect, sendToUser should be a no-op
      jest.clearAllMocks();
      gw.sendToUser(VALID_CLAIMS.sub, { type: 'test' });
      expect(socket.send).not.toHaveBeenCalled();
    });

    it('does NOT set presence offline when user still has other open connections', async () => {
      (validateAccessToken as jest.Mock).mockReturnValue(VALID_CLAIMS);

      const s1 = makeMockSocket();
      const s2 = makeMockSocket();
      simulateConnection(wss, s1, makeMockReq({ auth: 'Bearer t1' }));
      simulateConnection(wss, s2, makeMockReq({ auth: 'Bearer t2' }));
      await Promise.resolve();

      // Only s1 disconnects
      s1._emit('close');
      await Promise.resolve();

      const { PresenceManager } = require('./presence/presence-manager');
      const presence = PresenceManager.mock.results[0].value;
      expect(presence.setOffline).not.toHaveBeenCalled();
    });
  });
});
