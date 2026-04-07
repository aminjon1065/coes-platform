import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createConnection, Socket } from 'net';
import { Readable } from 'stream';

export interface ClamAvScanResult {
  status: 'clean' | 'infected';
  signature?: string;
}

@Injectable()
export class ClamAvService {
  private readonly logger = new Logger(ClamAvService.name);
  private readonly enabled: boolean;
  private readonly host: string;
  private readonly port: number;
  private readonly timeoutMs: number;
  private readonly chunkSize: number;

  constructor(private readonly config: ConfigService) {
    this.enabled = this.config.get<boolean>('clamav.enabled', false);
    this.host = this.config.get<string>('clamav.host', 'clamav');
    this.port = this.config.get<number>('clamav.port', 3310);
    this.timeoutMs = this.config.get<number>('clamav.timeoutMs', 30000);
    this.chunkSize = this.config.get<number>('clamav.chunkSize', 64 * 1024);
  }

  async scanStream(stream: Readable): Promise<ClamAvScanResult> {
    if (!this.enabled) {
      throw new Error('ClamAV scanning is disabled');
    }

    const socket = this.createSocket();
    socket.setEncoding('utf8');
    socket.setTimeout(this.timeoutMs);

    let settled = false;
    let response = '';

    return new Promise<ClamAvScanResult>(async (resolve, reject) => {
      const settle = (err?: Error, result?: ClamAvScanResult) => {
        if (settled) return;
        settled = true;
        socket.removeAllListeners();
        if (!socket.destroyed) {
          socket.end();
          socket.destroy();
        }
        if (err) reject(err);
        else resolve(result as ClamAvScanResult);
      };

      const tryParseResponse = () => {
        const normalized = response.replace(/\0/g, '').trim();
        if (!normalized) return false;

        if (normalized.endsWith('OK')) {
          settle(undefined, { status: 'clean' });
          return true;
        }

        const foundMatch = normalized.match(/: (.+) FOUND$/);
        if (foundMatch) {
          settle(undefined, { status: 'infected', signature: foundMatch[1] });
          return true;
        }

        if (normalized.includes('ERROR')) {
          settle(new Error(`ClamAV scan failed: ${normalized}`));
          return true;
        }

        return false;
      };

      socket.on('data', (chunk: string) => {
        response += chunk;
        if (response.includes('\0') || response.includes('\n')) {
          tryParseResponse();
        }
      });

      socket.once('timeout', () => {
        settle(new Error(`ClamAV scan timed out after ${this.timeoutMs} ms`));
      });

      socket.once('error', (err) => {
        settle(err as Error);
      });

      socket.once('close', (hadError) => {
        if (settled || hadError) return;
        if (!tryParseResponse()) {
          const normalized = response.replace(/\0/g, '').trim();
          settle(
            new Error(
              normalized
                ? `Unexpected ClamAV response: ${normalized}`
                : 'ClamAV closed the connection without a response',
            ),
          );
        }
      });

      try {
        await this.waitForConnect(socket);
        await this.writeChunk(socket, Buffer.from('zINSTREAM\0', 'utf8'));

        for await (const chunk of stream) {
          const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
          for (let offset = 0; offset < buffer.length; offset += this.chunkSize) {
            const part = buffer.subarray(offset, offset + this.chunkSize);
            const header = Buffer.alloc(4);
            header.writeUInt32BE(part.length, 0);
            await this.writeChunk(socket, header);
            await this.writeChunk(socket, part);
          }
        }

        await this.writeChunk(socket, Buffer.alloc(4));
      } catch (err) {
        this.logger.error(`ClamAV stream scan failed: ${(err as Error).message}`);
        settle(err as Error);
      }
    });
  }

  protected createSocket(): Socket {
    return createConnection({ host: this.host, port: this.port });
  }

  private async waitForConnect(socket: Socket): Promise<void> {
    if (socket.readyState === 'open') return;

    await new Promise<void>((resolve, reject) => {
      const onConnect = () => {
        cleanup();
        resolve();
      };
      const onError = (err: Error) => {
        cleanup();
        reject(err);
      };
      const cleanup = () => {
        socket.off('connect', onConnect);
        socket.off('error', onError);
      };

      socket.once('connect', onConnect);
      socket.once('error', onError);
    });
  }

  private async writeChunk(socket: Socket, payload: Buffer): Promise<void> {
    if (socket.destroyed) {
      throw new Error('ClamAV socket closed unexpectedly');
    }

    await new Promise<void>((resolve, reject) => {
      const onError = (err: Error) => {
        cleanup();
        reject(err);
      };
      const onDrain = () => {
        cleanup();
        resolve();
      };
      const cleanup = () => {
        socket.off('error', onError);
        socket.off('drain', onDrain);
      };

      socket.once('error', onError);
      const flushed = socket.write(payload);
      if (flushed) {
        cleanup();
        resolve();
      } else {
        socket.once('drain', onDrain);
      }
    });
  }
}
