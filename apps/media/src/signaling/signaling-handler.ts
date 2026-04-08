import { WebSocket } from 'ws';
import { types as msTypes } from 'mediasoup';
import { SessionManager, Participant } from '../sessions/session-manager';
import { logger } from '../logger';

interface SignalingMessage {
  id: string;
  type: string;
  payload: Record<string, unknown>;
}

interface SignalingResponse {
  id: string;
  type: string;
  payload?: unknown;
  error?: string;
}

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

export class SignalingHandler {
  constructor(
    private readonly sessionManager: SessionManager,
    private readonly hooks?: {
      onProducerAdded?: (
        sessionId: string,
        participantId: string,
        producer: msTypes.Producer,
      ) => Promise<void> | void;
    },
  ) {}

  handle(socket: WebSocket, participantId: string, userId: string, displayName: string): void {
    let activeSessionId: string | null = null;

    socket.on('close', () => {
      if (activeSessionId) {
        void this.handleDisconnect(activeSessionId, participantId);
      }
    });

    socket.on('message', async (raw) => {
      let msg: SignalingMessage;
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        this.send(socket, { id: '', type: 'error', error: 'Invalid JSON' });
        return;
      }

      try {
        const result = await this.dispatch(
          msg,
          socket,
          participantId,
          userId,
          displayName,
          (sessionId) => {
            activeSessionId = sessionId;
          },
          () => {
            activeSessionId = null;
          },
        );
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
    setActiveSessionId: (sessionId: string) => void,
    clearActiveSessionId: () => void,
  ): Promise<unknown> {
    const { type, payload } = msg;

    switch (type) {
      case 'join': {
        const sessionId = payload.sessionId as string;
        const channelId = payload.channelId as string;
        const classification = Number(payload.classification ?? 0);
        const session = await this.sessionManager.createSession(sessionId, channelId, classification);
        setActiveSessionId(sessionId);

        const participant: Participant = {
          participantId,
          userId,
          displayName,
          producers: new Map(),
          consumers: new Map(),
          joinedAt: new Date(),
          audioMuted: false,
          videoMuted: false,
          socket,
        };
        this.sessionManager.addParticipant(sessionId, participant);

        const participants = Array.from(session.participants.values())
          .filter((item) => item.participantId !== participantId)
          .map((item) => ({
            participantId: item.participantId,
            userId: item.userId,
            displayName: item.displayName,
            audioMuted: item.audioMuted,
            videoMuted: item.videoMuted,
          }));

        const producers = Array.from(session.participants.values())
          .filter((item) => item.participantId !== participantId)
          .flatMap((item) =>
            Array.from(item.producers.values()).map((producer) => ({
              producerId: producer.id,
              participantId: item.participantId,
              displayName: item.displayName,
              kind: producer.kind,
              source:
                producer.appData && producer.appData.source === 'screen' ? 'screen' : 'camera',
            })),
          );

        this.notifyOthers(session, participantId, {
          type: 'participant_joined',
          payload: {
            participantId,
            userId,
            displayName,
            audioMuted: false,
            videoMuted: false,
          },
        });

        return {
          rtpCapabilities: session.router.rtpCapabilities,
          participantId,
          participants,
          producers,
        };
      }

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

      case 'produce': {
        const sessionId = payload.sessionId as string;
        const kind = payload.kind as msTypes.MediaKind;
        const rtpParameters = payload.rtpParameters as msTypes.RtpParameters;
        const source = payload.source === 'screen' ? 'screen' : 'camera';

        const session = this.sessionManager.getSession(sessionId);
        if (!session) throw new Error('Session not found');

        const participant = session.participants.get(participantId);
        if (!participant?.sendTransport) throw new Error('Send transport not ready');

        const producer = await participant.sendTransport.produce({
          kind,
          rtpParameters,
          appData: { source },
        });
        participant.producers.set(producer.id, producer);
        producer.on('transportclose', () => {
          participant.producers.delete(producer.id);
        });

        this.notifyOthers(session, participantId, {
          type: 'new_producer',
          payload: {
            producerId: producer.id,
            participantId,
            displayName,
            kind,
            source,
          },
        });

        await this.hooks?.onProducerAdded?.(sessionId, participantId, producer);

        return { producerId: producer.id };
      }

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
          paused: true,
        });
        participant.consumers.set(consumer.id, consumer);
        consumer.on('transportclose', () => {
          participant.consumers.delete(consumer.id);
        });
        consumer.on('producerclose', () => {
          participant.consumers.delete(consumer.id);
        });

        return {
          consumerId: consumer.id,
          producerId,
          kind: consumer.kind,
          rtpParameters: consumer.rtpParameters,
        };
      }

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

      case 'leave': {
        const sessionId = payload.sessionId as string;
        clearActiveSessionId();
        await this.sessionManager.removeParticipant(sessionId, participantId);

        const session = this.sessionManager.getSession(sessionId);
        if (session) {
          this.notifyOthers(session, participantId, {
            type: 'participant_left',
            payload: { participantId },
          });
        }
        return {};
      }

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
          payload: {
            participantId,
            audioMuted: participant.audioMuted,
            videoMuted: participant.videoMuted,
          },
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
    session: { participants: Map<string, Participant> },
    excludeParticipantId: string,
    event: Record<string, unknown>,
  ): void {
    const message = JSON.stringify(event);
    for (const participant of session.participants.values()) {
      if (participant.participantId === excludeParticipantId) {
        continue;
      }

      if (participant.socket?.readyState === WebSocket.OPEN) {
        participant.socket.send(message);
      }
    }
  }

  private async handleDisconnect(sessionId: string, participantId: string): Promise<void> {
    const session = this.sessionManager.getSession(sessionId);
    if (!session?.participants.has(participantId)) {
      return;
    }

    await this.sessionManager.removeParticipant(sessionId, participantId);
    const nextSession = this.sessionManager.getSession(sessionId);
    if (nextSession) {
      this.notifyOthers(nextSession, participantId, {
        type: 'participant_left',
        payload: { participantId },
      });
    }
  }
}
