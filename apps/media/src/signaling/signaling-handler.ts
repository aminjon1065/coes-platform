import { WebSocket } from 'ws';
import { types as msTypes } from 'mediasoup';
import { SessionManager, Participant } from '../sessions/session-manager';
import { logger } from '../logger';

interface SignalingMessage {
  id: string;          // request id for correlation
  type: string;
  payload: Record<string, unknown>;
}

interface SignalingResponse {
  id: string;
  type: string;
  payload?: unknown;
  error?: string;
}

// WebRTC transport options — annotated IPs must match docker/host config
function transportOptions(): msTypes.WebRtcTransportOptions {
  const announcedIp = process.env.MEDIASOUP_ANNOUNCED_IP ?? '127.0.0.1';
  return {
    listenIps: [
      {
        ip: '0.0.0.0',
        announcedIp,
      },
    ],
    enableUdp: true,
    enableTcp: true,
    preferUdp: true,
    initialAvailableOutgoingBitrate: 1_000_000,
  };
}

/**
 * Handles per-WebSocket-connection WebRTC signaling.
 * Each authenticated connection is tied to one participant in one session.
 */
export class SignalingHandler {
  constructor(
    private readonly sessionManager: SessionManager,
  ) {}

  handle(socket: WebSocket, participantId: string, userId: string, displayName: string): void {
    socket.on('message', async (raw) => {
      let msg: SignalingMessage;
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        this.send(socket, { id: '', type: 'error', error: 'Invalid JSON' });
        return;
      }

      try {
        const result = await this.dispatch(msg, socket, participantId, userId, displayName);
        this.send(socket, { id: msg.id, type: `${msg.type}_ok`, payload: result });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Internal error';
        logger.error({ err, type: msg.type, participantId }, 'Signaling error');
        this.send(socket, { id: msg.id, type: `${msg.type}_error`, error: message });
      }
    });
  }

  private async dispatch(
    msg: SignalingMessage,
    socket: WebSocket,
    participantId: string,
    userId: string,
    displayName: string,
  ): Promise<unknown> {
    const { type, payload } = msg;

    switch (type) {
      // ── Join a call session ───────────────────────────────────────────────
      case 'join': {
        const sessionId = payload.sessionId as string;
        const channelId = payload.channelId as string;

        const session = await this.sessionManager.createSession(sessionId, channelId);

        const participant: Participant = {
          participantId,
          userId,
          displayName,
          producers: new Map(),
          consumers: new Map(),
          joinedAt: new Date(),
          audioMuted: false,
          videoMuted: false,
        };
        this.sessionManager.addParticipant(sessionId, participant);

        return {
          rtpCapabilities: session.router.rtpCapabilities,
          participantId,
        };
      }

      // ── Create send (uplink) transport ───────────────────────────────────
      case 'create_send_transport': {
        const sessionId = payload.sessionId as string;
        const session = this.sessionManager.getSession(sessionId);
        if (!session) throw new Error('Session not found');

        const transport = await session.router.createWebRtcTransport(transportOptions());
        const participant = session.participants.get(participantId);
        if (!participant) throw new Error('Participant not in session');
        participant.sendTransport = transport;

        return {
          id: transport.id,
          iceParameters: transport.iceParameters,
          iceCandidates: transport.iceCandidates,
          dtlsParameters: transport.dtlsParameters,
        };
      }

      // ── Create recv (downlink) transport ─────────────────────────────────
      case 'create_recv_transport': {
        const sessionId = payload.sessionId as string;
        const session = this.sessionManager.getSession(sessionId);
        if (!session) throw new Error('Session not found');

        const transport = await session.router.createWebRtcTransport(transportOptions());
        const participant = session.participants.get(participantId);
        if (!participant) throw new Error('Participant not in session');
        participant.recvTransport = transport;

        return {
          id: transport.id,
          iceParameters: transport.iceParameters,
          iceCandidates: transport.iceCandidates,
          dtlsParameters: transport.dtlsParameters,
        };
      }

      // ── Connect transport (exchange DTLS) ────────────────────────────────
      case 'connect_transport': {
        const sessionId = payload.sessionId as string;
        const transportId = payload.transportId as string;
        const dtlsParameters = payload.dtlsParameters as msTypes.DtlsParameters;

        const session = this.sessionManager.getSession(sessionId);
        if (!session) throw new Error('Session not found');

        const participant = session.participants.get(participantId);
        if (!participant) throw new Error('Participant not in session');

        const transport =
          participant.sendTransport?.id === transportId
            ? participant.sendTransport
            : participant.recvTransport?.id === transportId
            ? participant.recvTransport
            : undefined;

        if (!transport) throw new Error('Transport not found');
        await transport.connect({ dtlsParameters });
        return {};
      }

      // ── Produce (start sending media) ────────────────────────────────────
      case 'produce': {
        const sessionId = payload.sessionId as string;
        const kind = payload.kind as msTypes.MediaKind;
        const rtpParameters = payload.rtpParameters as msTypes.RtpParameters;

        const session = this.sessionManager.getSession(sessionId);
        if (!session) throw new Error('Session not found');

        const participant = session.participants.get(participantId);
        if (!participant?.sendTransport) throw new Error('Send transport not ready');

        const producer = await participant.sendTransport.produce({ kind, rtpParameters });
        participant.producers.set(producer.id, producer);

        // Notify other participants that a new producer is available
        this.notifyOthers(session, participantId, {
          type: 'new_producer',
          payload: {
            producerId: producer.id,
            participantId,
            displayName,
            kind,
          },
        });

        return { producerId: producer.id };
      }

      // ── Consume (start receiving a producer) ─────────────────────────────
      case 'consume': {
        const sessionId = payload.sessionId as string;
        const producerId = payload.producerId as string;
        const rtpCapabilities = payload.rtpCapabilities as msTypes.RtpCapabilities;

        const session = this.sessionManager.getSession(sessionId);
        if (!session) throw new Error('Session not found');

        if (!session.router.canConsume({ producerId, rtpCapabilities })) {
          throw new Error('Cannot consume this producer with given RTP capabilities');
        }

        const participant = session.participants.get(participantId);
        if (!participant?.recvTransport) throw new Error('Recv transport not ready');

        const consumer = await participant.recvTransport.consume({
          producerId,
          rtpCapabilities,
          paused: true,   // client resumes after ICE
        });
        participant.consumers.set(consumer.id, consumer);

        return {
          consumerId: consumer.id,
          producerId,
          kind: consumer.kind,
          rtpParameters: consumer.rtpParameters,
        };
      }

      // ── Resume a consumer ────────────────────────────────────────────────
      case 'resume_consumer': {
        const sessionId = payload.sessionId as string;
        const consumerId = payload.consumerId as string;

        const session = this.sessionManager.getSession(sessionId);
        if (!session) throw new Error('Session not found');

        const participant = session.participants.get(participantId);
        const consumer = participant?.consumers.get(consumerId);
        if (!consumer) throw new Error('Consumer not found');

        await consumer.resume();
        return {};
      }

      // ── Leave session ────────────────────────────────────────────────────
      case 'leave': {
        const sessionId = payload.sessionId as string;
        await this.sessionManager.removeParticipant(sessionId, participantId);

        // Notify remaining participants
        const session = this.sessionManager.getSession(sessionId);
        if (session) {
          this.notifyOthers(session, participantId, {
            type: 'participant_left',
            payload: { participantId },
          });
        }
        return {};
      }

      // ── Mute/unmute ──────────────────────────────────────────────────────
      case 'set_mute': {
        const sessionId = payload.sessionId as string;
        const audioMuted = payload.audioMuted as boolean | undefined;
        const videoMuted = payload.videoMuted as boolean | undefined;

        const session = this.sessionManager.getSession(sessionId);
        if (!session) throw new Error('Session not found');

        const participant = session.participants.get(participantId);
        if (!participant) throw new Error('Participant not in session');

        if (audioMuted !== undefined) participant.audioMuted = audioMuted;
        if (videoMuted !== undefined) participant.videoMuted = videoMuted;

        this.notifyOthers(session, participantId, {
          type: 'mute_changed',
          payload: { participantId, audioMuted: participant.audioMuted, videoMuted: participant.videoMuted },
        });
        return {};
      }

      default:
        throw new Error(`Unknown message type: ${type}`);
    }
  }

  private send(socket: WebSocket, data: SignalingResponse): void {
    if (socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(data));
    }
  }

  private notifyOthers(
    session: { participants: Map<string, Participant & { _socket?: WebSocket }> },
    excludeParticipantId: string,
    event: unknown,
  ): void {
    // Sessions don't hold sockets directly — events are published via RabbitMQ
    // so the gateway can fan them out to connected clients.
    // The media-server.ts publishes 'media.*' events for this purpose.
    void session; void excludeParticipantId; void event;
    // Concrete fan-out is wired in MediaServer.publishSessionEvent()
  }
}
