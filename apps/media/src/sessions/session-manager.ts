import { types as msTypes } from 'mediasoup';
import { Redis } from 'ioredis';
import { WebSocket } from 'ws';
import { WorkerPool } from '../workers/worker-pool';
import { logger } from '../logger';

export interface CallSession {
  sessionId: string;
  channelId: string;        // linked chat channel or call room
  router: msTypes.Router;
  participants: Map<string, Participant>;
  createdAt: Date;
  recordingActive: boolean;
}

export interface Participant {
  participantId: string;    // position ID from backend
  userId: string;
  displayName: string;
  sendTransport?: msTypes.WebRtcTransport;
  recvTransport?: msTypes.WebRtcTransport;
  producers: Map<string, msTypes.Producer>;   // producerId → Producer
  consumers: Map<string, msTypes.Consumer>;   // consumerId → Consumer
  joinedAt: Date;
  audioMuted: boolean;
  videoMuted: boolean;
  socket?: WebSocket;
}

const SESSION_TTL_SECONDS = 6 * 60 * 60; // 6 hours max session lifetime

export class SessionManager {
  private sessions = new Map<string, CallSession>();

  constructor(
    private readonly workerPool: WorkerPool,
    private readonly redis: Redis,
  ) {}

  async createSession(
    sessionId: string,
    channelId: string,
    classification = 0,
  ): Promise<CallSession> {
    if (this.sessions.has(sessionId)) {
      return this.sessions.get(sessionId)!;
    }

    const router = await this.workerPool.createRouter();
    router.appData = {
      ...(router.appData ?? {}),
      classification,
    };

    const session: CallSession = {
      sessionId,
      channelId,
      router,
      participants: new Map(),
      createdAt: new Date(),
      recordingActive: false,
    };

    this.sessions.set(sessionId, session);

    // Track session in Redis for multi-instance discovery
    await this.redis.setex(
      `media:session:${sessionId}`,
      SESSION_TTL_SECONDS,
      JSON.stringify({
        sessionId,
        channelId,
        classification,
        instanceId: process.env.INSTANCE_ID ?? process.pid.toString(),
        createdAt: session.createdAt.toISOString(),
      }),
    );

    logger.info({ sessionId, channelId }, 'Call session created');
    return session;
  }

  async endSession(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    // Close all transports and producers
    for (const participant of session.participants.values()) {
      await this.removeParticipant(sessionId, participant.participantId);
    }

    session.router.close();
    this.sessions.delete(sessionId);
    await this.redis.del(`media:session:${sessionId}`);

    logger.info({ sessionId }, 'Call session ended');
  }

  getSession(sessionId: string): CallSession | undefined {
    return this.sessions.get(sessionId);
  }

  getParticipant(sessionId: string, participantId: string): Participant | undefined {
    return this.sessions.get(sessionId)?.participants.get(participantId);
  }

  setParticipantMute(
    sessionId: string,
    participantId: string,
    audioMuted?: boolean,
    videoMuted?: boolean,
  ): { session: CallSession; participant: Participant } | null {
    const session = this.sessions.get(sessionId);
    const participant = session?.participants.get(participantId);

    if (!session || !participant) {
      return null;
    }

    if (audioMuted !== undefined) {
      participant.audioMuted = audioMuted;
    }
    if (videoMuted !== undefined) {
      participant.videoMuted = videoMuted;
    }

    return { session, participant };
  }

  addParticipant(sessionId: string, participant: Participant): void {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error(`Session ${sessionId} not found`);
    session.participants.set(participant.participantId, participant);

    // Refresh Redis TTL while session is active
    this.redis
      .expire(`media:session:${sessionId}`, SESSION_TTL_SECONDS)
      .catch((err) => logger.error(err, 'Failed to refresh session TTL'));

    logger.info(
      { sessionId, participantId: participant.participantId },
      'Participant joined session',
    );
  }

  async removeParticipant(sessionId: string, participantId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    const participant = session.participants.get(participantId);
    if (!participant) return;

    // Close all consumers
    for (const consumer of participant.consumers.values()) {
      consumer.close();
    }
    // Close all producers
    for (const producer of participant.producers.values()) {
      producer.close();
    }
    // Close transports
    participant.sendTransport?.close();
    participant.recvTransport?.close();

    session.participants.delete(participantId);

    logger.info({ sessionId, participantId }, 'Participant left session');

    // Keep the router alive while server-side recording is finalizing.
    if (session.participants.size === 0 && !session.recordingActive) {
      await this.endSession(sessionId);
    }
  }

  getActiveSessions(): string[] {
    return Array.from(this.sessions.keys());
  }
}
