import { ChildProcess, spawn } from 'child_process';
import { mkdir, writeFile, stat, unlink, rm } from 'fs/promises';
import path from 'path';
import dgram from 'dgram';
import { types as msTypes } from 'mediasoup';
import { logger } from '../logger';
import { SessionManager, Participant } from '../sessions/session-manager';
import { ObjectStorage } from '../storage/object-storage';

type MediaRecordingEvent =
  | {
      type: 'media.recording.started';
      recordingId: string;
      sessionId: string;
      trackCount: number;
    }
  | {
      type: 'media.recording.ready';
      recordingId: string;
      sessionId: string;
      storageKey: string;
      sizeBytes: number;
      durationSeconds: number;
      trackCount: number;
    }
  | {
      type: 'media.recording.failed';
      recordingId: string;
      sessionId: string;
      error: string;
    };

type PublishRecordingEvent = (event: MediaRecordingEvent) => Promise<void>;

type TrackRecording = {
  producerId: string;
  participantId: string;
  displayName: string;
  kind: msTypes.MediaKind;
  source: string;
  codecMimeType: string;
  transport: msTypes.PlainTransport;
  consumer: msTypes.Consumer;
  process: ChildProcess;
  outputPath: string;
  relativeOutputPath: string;
  remotePort: number;
  stopped: boolean;
};

type SessionRecording = {
  recordingId: string;
  sessionId: string;
  outputDir: string;
  relativeOutputDir: string;
  startedAt: Date;
  tracks: Map<string, TrackRecording>;
};

const FFMPEG_PATH = process.env.MEDIA_FFMPEG_PATH ?? 'ffmpeg';
const ARCHIVER_PATH = process.env.MEDIA_ARCHIVER_PATH ?? 'tar';
const RECORDINGS_DIR = path.resolve(
  process.cwd(),
  process.env.MEDIA_RECORDINGS_DIR ?? 'var/recordings',
);
const RECORDING_ARTIFACT_PREFIX = process.env.MEDIA_RECORDING_ARTIFACT_PREFIX ?? 'recordings';

export class RecordingManager {
  private readonly recordingsById = new Map<string, SessionRecording>();
  private readonly recordingIdBySessionId = new Map<string, string>();
  private readonly objectStorage = new ObjectStorage();

  constructor(
    private readonly sessionManager: SessionManager,
    private readonly publishEvent: PublishRecordingEvent,
  ) {}

  async startRecording(sessionId: string, recordingId: string): Promise<void> {
    const session = this.sessionManager.getSession(sessionId);
    if (!session) {
      await this.publishEvent({
        type: 'media.recording.failed',
        recordingId,
        sessionId,
        error: 'Session not found in media service',
      });
      return;
    }

    if (this.recordingsById.has(recordingId) || this.recordingIdBySessionId.has(sessionId)) {
      await this.publishEvent({
        type: 'media.recording.failed',
        recordingId,
        sessionId,
        error: 'Recording is already active for this session',
      });
      return;
    }

    const relativeOutputDir = path.posix.join(RECORDING_ARTIFACT_PREFIX, recordingId);
    const outputDir = path.join(RECORDINGS_DIR, recordingId);
    await mkdir(outputDir, { recursive: true });

    const recording: SessionRecording = {
      recordingId,
      sessionId,
      outputDir,
      relativeOutputDir,
      startedAt: new Date(),
      tracks: new Map(),
    };

    this.recordingsById.set(recordingId, recording);
    this.recordingIdBySessionId.set(sessionId, recordingId);
    session.recordingActive = true;

    const producerStarts = Array.from(session.participants.values()).flatMap((participant) =>
      Array.from(participant.producers.values()).map((producer) =>
        this.ensureTrackRecording(recording, session, participant, producer),
      ),
    );

    await Promise.allSettled(producerStarts);

    await this.publishEvent({
      type: 'media.recording.started',
      recordingId,
      sessionId,
      trackCount: recording.tracks.size,
    });
  }

  async stopRecording(recordingId: string): Promise<void> {
    const recording = this.recordingsById.get(recordingId);
    if (!recording) {
      return;
    }

    const session = this.sessionManager.getSession(recording.sessionId);
    if (session) {
      session.recordingActive = false;
    }

    const settled = await Promise.allSettled(
      Array.from(recording.tracks.values()).map((track) => this.stopTrackRecording(track)),
    );

    const failures = settled.filter((result) => result.status === 'rejected');
    if (failures.length === settled.length && settled.length > 0) {
      const firstFailure = failures[0] as PromiseRejectedResult;
      await this.failRecording(recording, firstFailure.reason);
      return;
    }

    try {
      const manifestPath = path.join(recording.outputDir, 'manifest.json');
      const archivePath = path.join(RECORDINGS_DIR, `${recording.recordingId}.tar`);
      const durationSeconds = Math.max(
        1,
        Math.round((Date.now() - recording.startedAt.getTime()) / 1000),
      );
      const trackFiles = await Promise.all(
        Array.from(recording.tracks.values()).map(async (track) => {
          const metadata = await stat(track.outputPath).catch(() => null);
          return {
            producerId: track.producerId,
            participantId: track.participantId,
            displayName: track.displayName,
            kind: track.kind,
            source: track.source,
            codecMimeType: track.codecMimeType,
            artifact: path.posix.join(
              recording.relativeOutputDir,
              path.basename(track.outputPath),
            ),
            sizeBytes: metadata ? metadata.size : 0,
          };
        }),
      );

      const totalSizeBytes = trackFiles.reduce((sum, track) => sum + track.sizeBytes, 0);
      await writeFile(
        manifestPath,
        JSON.stringify(
          {
            recordingId,
            sessionId: recording.sessionId,
            startedAt: recording.startedAt.toISOString(),
            finishedAt: new Date().toISOString(),
            durationSeconds,
            tracks: trackFiles,
          },
          null,
          2,
        ),
        'utf8',
      );

      await this.archiveRecording(recording.outputDir, archivePath);

      const archiveStorageKey = this.objectStorage.buildRecordingStorageKey(
        this.readClassification(recording.sessionId),
        recording.recordingId,
        `${recording.recordingId}.tar`,
      );
      const manifestStorageKey = this.objectStorage.buildRecordingStorageKey(
        this.readClassification(recording.sessionId),
        recording.recordingId,
        'manifest.json',
      );

      const [archiveSizeBytes] = await Promise.all([
        this.objectStorage.uploadFile(archiveStorageKey, archivePath, 'application/x-tar'),
        this.objectStorage.uploadFile(manifestStorageKey, manifestPath, 'application/json'),
      ]);

      await this.publishEvent({
        type: 'media.recording.ready',
        recordingId,
        sessionId: recording.sessionId,
        storageKey: archiveStorageKey,
        sizeBytes: archiveSizeBytes,
        durationSeconds,
        trackCount: trackFiles.length,
      });

      await Promise.allSettled([
        unlink(archivePath),
        rm(recording.outputDir, { recursive: true, force: true }),
      ]);
    } catch (error) {
      await this.failRecording(recording, error);
      return;
    } finally {
      this.recordingsById.delete(recordingId);
      this.recordingIdBySessionId.delete(recording.sessionId);
    }
  }

  async stopRecordingBySession(sessionId: string): Promise<void> {
    const recordingId = this.recordingIdBySessionId.get(sessionId);
    if (!recordingId) {
      return;
    }

    await this.stopRecording(recordingId);
  }

  async stopAll(): Promise<void> {
    const recordingIds = Array.from(this.recordingsById.keys());
    await Promise.allSettled(recordingIds.map((recordingId) => this.stopRecording(recordingId)));
  }

  async handleProducerAdded(
    sessionId: string,
    participantId: string,
    producer: msTypes.Producer,
  ): Promise<void> {
    const recordingId = this.recordingIdBySessionId.get(sessionId);
    if (!recordingId) {
      return;
    }

    const recording = this.recordingsById.get(recordingId);
    const session = this.sessionManager.getSession(sessionId);
    const participant = this.sessionManager.getParticipant(sessionId, participantId);
    if (!recording || !session || !participant) {
      return;
    }

    try {
      await this.ensureTrackRecording(recording, session, participant, producer);
    } catch (error) {
      logger.error(
        { err: error, recordingId, sessionId, producerId: producer.id },
        'Failed to start track recording for new producer',
      );
    }
  }

  private async ensureTrackRecording(
    recording: SessionRecording,
    session: { router: msTypes.Router },
    participant: Participant,
    producer: msTypes.Producer,
  ): Promise<void> {
    if (recording.tracks.has(producer.id)) {
      return;
    }

    const codec = this.selectPrimaryCodec(producer.rtpParameters.codecs);
    if (!codec) {
      throw new Error(`Unsupported producer codec for ${producer.id}`);
    }

    const transport = await session.router.createPlainTransport({
      listenIp: { ip: '127.0.0.1', announcedIp: undefined },
      rtcpMux: true,
      comedia: false,
    });

    const remotePort = await this.allocateUdpPort();
    await transport.connect({ ip: '127.0.0.1', port: remotePort });

    const consumer = await transport.consume({
      producerId: producer.id,
      rtpCapabilities: session.router.rtpCapabilities,
      paused: true,
    });

    const extension = this.outputExtensionForCodec(codec.mimeType, producer.kind);
    const safeDisplayName = participant.displayName.replace(/[^a-zA-Z0-9-_]+/g, '_') || 'unknown';
    const baseName = `${participant.participantId}-${producer.kind}-${producer.appData?.source === 'screen' ? 'screen' : 'camera'}-${safeDisplayName}`;
    const outputPath = path.join(recording.outputDir, `${baseName}.${extension}`);
    const relativeOutputPath = path.posix.join(
      recording.relativeOutputDir,
      `${baseName}.${extension}`,
    );

    const ffmpeg = spawn(
      FFMPEG_PATH,
      [
        '-loglevel',
        'error',
        '-protocol_whitelist',
        'file,pipe,udp,rtp',
        '-fflags',
        '+genpts',
        '-f',
        'sdp',
        '-i',
        'pipe:0',
        '-map',
        '0',
        '-c',
        'copy',
        '-y',
        outputPath,
      ],
      {
        stdio: ['pipe', 'ignore', 'pipe'],
      },
    );

    ffmpeg.stderr?.on('data', (chunk) => {
      logger.warn(
        {
          recordingId: recording.recordingId,
          producerId: producer.id,
          stderr: chunk.toString(),
        },
        'FFmpeg recorder stderr',
      );
    });

    const sdp = this.buildSdp(codec, producer.kind, remotePort);
    ffmpeg.stdin?.write(sdp);
    ffmpeg.stdin?.end();

    const track: TrackRecording = {
      producerId: producer.id,
      participantId: participant.participantId,
      displayName: participant.displayName,
      kind: producer.kind,
      source: producer.appData?.source === 'screen' ? 'screen' : 'camera',
      codecMimeType: codec.mimeType,
      transport,
      consumer,
      process: ffmpeg,
      outputPath,
      relativeOutputPath,
      remotePort,
      stopped: false,
    };

    recording.tracks.set(producer.id, track);

    producer.on('@close', () => {
      void this.stopTrackRecording(track);
    });
    consumer.on('producerclose', () => {
      void this.stopTrackRecording(track);
    });
    consumer.on('transportclose', () => {
      void this.stopTrackRecording(track);
    });

    await consumer.resume();
  }

  private async stopTrackRecording(track: TrackRecording): Promise<void> {
    if (track.stopped) {
      return;
    }

    track.stopped = true;

    track.consumer.close();
    track.transport.close();

    await new Promise<void>((resolve) => {
      const finalize = () => resolve();

      track.process.once('close', () => finalize());
      track.process.once('error', () => finalize());

      if (track.process.killed || track.process.exitCode !== null) {
        finalize();
        return;
      }

      track.process.kill('SIGINT');
      setTimeout(() => {
        if (track.process.exitCode === null) {
          track.process.kill('SIGKILL');
        }
      }, 2_000).unref();
    });
  }

  private async failRecording(
    recording: SessionRecording,
    error: unknown,
  ): Promise<void> {
    logger.error(
      { err: error, recordingId: recording.recordingId, sessionId: recording.sessionId },
      'Recording pipeline failed',
    );

    const session = this.sessionManager.getSession(recording.sessionId);
    if (session) {
      session.recordingActive = false;
    }

    this.recordingsById.delete(recording.recordingId);
    this.recordingIdBySessionId.delete(recording.sessionId);

    await this.publishEvent({
      type: 'media.recording.failed',
      recordingId: recording.recordingId,
      sessionId: recording.sessionId,
      error: error instanceof Error ? error.message : 'Unknown recording failure',
    });
  }

  private readClassification(sessionId: string): number {
    const classification = this.sessionManager.getSession(sessionId)?.router.appData?.classification;
    return typeof classification === 'number' ? classification : 0;
  }

  private selectPrimaryCodec(
    codecs: msTypes.RtpCodecParameters[],
  ): msTypes.RtpCodecParameters | null {
    return (
      codecs.find((codec) => !/rtx|red|ulpfec/i.test(codec.mimeType)) ??
      codecs[0] ??
      null
    );
  }

  private outputExtensionForCodec(mimeType: string, kind: msTypes.MediaKind): string {
    if (kind === 'audio') {
      return 'ogg';
    }

    return /h264/i.test(mimeType) ? 'mp4' : 'webm';
  }

  private buildSdp(
    codec: msTypes.RtpCodecParameters,
    kind: msTypes.MediaKind,
    port: number,
  ): string {
    const payloadType = codec.payloadType;
    const clockRate = codec.clockRate;
    const channels =
      kind === 'audio' && typeof codec.channels === 'number' ? `/${codec.channels}` : '';
    const codecName = codec.mimeType.split('/')[1];
    const fmtpEntries = Object.entries(codec.parameters ?? {})
      .map(([key, value]) => `${key}=${value}`)
      .join(';');

    return [
      'v=0',
      'o=- 0 0 IN IP4 127.0.0.1',
      's=CoESCD Call Recording',
      'c=IN IP4 127.0.0.1',
      't=0 0',
      `m=${kind} ${port} RTP/AVP ${payloadType}`,
      `a=rtpmap:${payloadType} ${codecName}/${clockRate}${channels}`,
      fmtpEntries ? `a=fmtp:${payloadType} ${fmtpEntries}` : '',
      'a=recvonly',
      'a=rtcp-mux',
    ]
      .filter(Boolean)
      .join('\r\n')
      .concat('\r\n');
  }

  private async allocateUdpPort(): Promise<number> {
    return new Promise<number>((resolve, reject) => {
      const socket = dgram.createSocket('udp4');
      socket.once('error', (error) => {
        socket.close();
        reject(error);
      });
      socket.bind(0, '127.0.0.1', () => {
        const address = socket.address();
        if (typeof address === 'string') {
          socket.close();
          reject(new Error('Unexpected UDP socket address'));
          return;
        }

        const { port } = address;
        socket.close(() => resolve(port));
      });
    });
  }

  private async archiveRecording(sourceDir: string, archivePath: string): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      const archive = spawn(
        ARCHIVER_PATH,
        ['-cf', archivePath, '-C', sourceDir, '.'],
        { stdio: ['ignore', 'ignore', 'pipe'] },
      );

      archive.stderr?.on('data', (chunk) => {
        logger.warn({ stderr: chunk.toString() }, 'Archive builder stderr');
      });

      archive.once('error', reject);
      archive.once('close', (code) => {
        if (code === 0) {
          resolve();
          return;
        }

        reject(new Error(`Archive process exited with code ${code ?? 'unknown'}`));
      });
    });
  }
}
