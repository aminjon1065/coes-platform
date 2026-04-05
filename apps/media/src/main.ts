import 'dotenv/config';
import http from 'http';
import { WebSocketServer } from 'ws';
import { MediaServer } from './media-server';
import { logger } from './logger';

const PORT = parseInt(process.env.PORT ?? '4002', 10);
const HOST = process.env.HOST ?? '0.0.0.0';

async function bootstrap(): Promise<void> {
  // HTTP server handles /health + /metrics; WebSocket handles signaling
  const httpServer = http.createServer((req, res) => {
    if (req.url === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok', service: 'media', ts: Date.now() }));
      return;
    }
    if (req.url === '/metrics') {
      // Prometheus text format — worker count + active sessions
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end(
        '# HELP media_active_sessions Number of active call sessions\n' +
        '# TYPE media_active_sessions gauge\n' +
        `media_active_sessions ${mediaServer.getActiveSessionCount()}\n`,
      );
      return;
    }
    res.writeHead(404);
    res.end();
  });

  const wss = new WebSocketServer({ server: httpServer, path: '/ws' });
  const mediaServer = new MediaServerWithMetrics(wss);

  await mediaServer.start();

  httpServer.listen(PORT, HOST, () => {
    logger.info({ port: PORT, host: HOST }, 'CoESCD Media Service listening');
  });

  // Graceful shutdown
  const shutdown = async (signal: string): Promise<void> => {
    logger.info({ signal }, 'Shutting down media service');
    httpServer.close();
    await mediaServer.stop();
    process.exit(0);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT',  () => shutdown('SIGINT'));
}

// Thin extension to expose active session count for /metrics
import { WebSocketServer as WSS } from 'ws';
class MediaServerWithMetrics extends MediaServer {
  constructor(wss: WSS) {
    super(wss);
  }
  getActiveSessionCount(): number {
    return this['sessionManager'].getActiveSessions().length;
  }
}

bootstrap().catch((err) => {
  logger.error(err, 'Failed to start media service');
  process.exit(1);
});
