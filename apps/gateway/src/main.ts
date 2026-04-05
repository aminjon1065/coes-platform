import 'dotenv/config';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import { GatewayServer } from './gateway';
import { logger } from './logger';

const PORT = parseInt(process.env.PORT ?? '4001', 10);

const httpServer = createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', service: 'coescd-gateway' }));
    return;
  }
  if (req.url === '/metrics') {
    // Prometheus metrics endpoint — expose connection counts etc.
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('# CoESCD Gateway metrics\n');
    return;
  }
  res.writeHead(404);
  res.end();
});

const wss = new WebSocketServer({ server: httpServer, path: '/ws' });

const gateway = new GatewayServer(wss);

gateway.start().then(() => {
  httpServer.listen(PORT, '0.0.0.0', () => {
    logger.info({ port: PORT }, 'CoESCD WebSocket Gateway started');
  });
}).catch((err) => {
  logger.error(err, 'Gateway failed to start');
  process.exit(1);
});

process.on('SIGTERM', async () => {
  logger.info('SIGTERM received — shutting down gracefully');
  httpServer.close();
  await gateway.stop();
  process.exit(0);
});
