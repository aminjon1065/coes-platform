import * as mediasoup from 'mediasoup';
import { types as msTypes } from 'mediasoup';
import * as os from 'os';
import { logger } from '../logger';

const RTC_MIN_PORT = parseInt(process.env.RTC_MIN_PORT ?? '10000', 10);
const RTC_MAX_PORT = parseInt(process.env.RTC_MAX_PORT ?? '10100', 10);

// Mediasoup codecs — H.264 for video (mandatory for gov hardware), Opus for audio
const ROUTER_MEDIA_CODECS: msTypes.RtpCodecCapability[] = [
  {
    kind: 'audio',
    mimeType: 'audio/opus',
    clockRate: 48000,
    channels: 2,
  },
  {
    kind: 'video',
    mimeType: 'video/H264',
    clockRate: 90000,
    parameters: {
      'packetization-mode': 1,
      'profile-level-id': '42e01f',
      'level-asymmetry-allowed': 1,
    },
  },
  {
    kind: 'video',
    mimeType: 'video/VP8',
    clockRate: 90000,
  },
];

export class WorkerPool {
  private workers: msTypes.Worker[] = [];
  private nextWorkerIndex = 0;

  async start(): Promise<void> {
    const numWorkers = parseInt(
      process.env.MEDIASOUP_WORKERS ?? String(os.cpus().length),
      10,
    );

    logger.info({ numWorkers }, 'Starting mediasoup worker pool');

    for (let i = 0; i < numWorkers; i++) {
      const worker = await mediasoup.createWorker({
        logLevel: (process.env.MEDIASOUP_LOG_LEVEL ?? 'warn') as msTypes.WorkerLogLevel,
        logTags: ['rtp', 'rtcp', 'dtls'],
        rtcMinPort: RTC_MIN_PORT,
        rtcMaxPort: RTC_MAX_PORT,
      });

      worker.on('died', (err) => {
        logger.error({ err, workerId: worker.pid }, 'Mediasoup worker died — respawning');
        // Remove dead worker and spawn a replacement
        this.workers = this.workers.filter((w) => w !== worker);
        this.spawnReplacement();
      });

      this.workers.push(worker);
      logger.info({ pid: worker.pid, workerIndex: i }, 'Mediasoup worker started');
    }
  }

  async stop(): Promise<void> {
    for (const worker of this.workers) {
      worker.close();
    }
    this.workers = [];
    logger.info('Mediasoup worker pool stopped');
  }

  /** Round-robin across available workers */
  pick(): msTypes.Worker {
    if (this.workers.length === 0) {
      throw new Error('No mediasoup workers available');
    }
    const worker = this.workers[this.nextWorkerIndex % this.workers.length];
    this.nextWorkerIndex = (this.nextWorkerIndex + 1) % this.workers.length;
    return worker;
  }

  /** Create a new Router on the least-loaded worker */
  async createRouter(): Promise<msTypes.Router> {
    const worker = this.pick();
    return worker.createRouter({ mediaCodecs: ROUTER_MEDIA_CODECS });
  }

  get size(): number {
    return this.workers.length;
  }

  private async spawnReplacement(): Promise<void> {
    try {
      const worker = await mediasoup.createWorker({
        logLevel: (process.env.MEDIASOUP_LOG_LEVEL ?? 'warn') as msTypes.WorkerLogLevel,
        logTags: ['rtp', 'rtcp', 'dtls'],
        rtcMinPort: RTC_MIN_PORT,
        rtcMaxPort: RTC_MAX_PORT,
      });
      worker.on('died', (err) => {
        logger.error({ err, workerId: worker.pid }, 'Replacement mediasoup worker died');
        this.workers = this.workers.filter((w) => w !== worker);
        this.spawnReplacement();
      });
      this.workers.push(worker);
      logger.info({ pid: worker.pid }, 'Replacement mediasoup worker spawned');
    } catch (err) {
      logger.error(err, 'Failed to spawn replacement mediasoup worker');
    }
  }
}
