import { EventEmitter } from 'events';
import { Socket } from 'net';
import { Readable } from 'stream';

import { ClamAvService } from './clamav.service';

class FakeSocket extends EventEmitter {
  destroyed = false;
  readyState: string = 'opening';
  written: Buffer[] = [];

  setEncoding(): this {
    return this;
  }

  setTimeout(): this {
    return this;
  }

  write(chunk: string | Buffer): boolean {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    this.written.push(buffer);
    return true;
  }

  end(): this {
    return this;
  }

  destroy(): this {
    this.destroyed = true;
    this.readyState = 'closed';
    return this;
  }
}

class TestableClamAvService extends ClamAvService {
  constructor(config: any, private readonly socket: Socket) {
    super(config);
  }

  protected createSocket(): Socket {
    return this.socket;
  }
}

describe('ClamAvService', () => {
  const makeConfig = (overrides: Record<string, unknown> = {}) => ({
    get: jest.fn((key: string, defaultValue?: unknown) => {
      const values: Record<string, unknown> = {
        'clamav.enabled': true,
        'clamav.host': 'clamav',
        'clamav.port': 3310,
        'clamav.timeoutMs': 30000,
        'clamav.chunkSize': 4,
        ...overrides,
      };

      return key in values ? values[key] : defaultValue;
    }),
  });

  it('streams content to clamd using INSTREAM framing and resolves clean results', async () => {
    const socket = new FakeSocket() as unknown as Socket & FakeSocket;
    const service = new TestableClamAvService(makeConfig(), socket);

    process.nextTick(() => {
      socket.readyState = 'open';
      socket.emit('connect');
    });

    const resultPromise = service.scanStream(Readable.from([Buffer.from('abcdef')]));

    setImmediate(() => {
      socket.emit('data', 'stream: OK\0');
      socket.emit('close', false);
    });

    await expect(resultPromise).resolves.toEqual({ status: 'clean' });
    expect(socket.written[0].toString('utf8')).toBe('zINSTREAM\0');
    expect(socket.written[1].readUInt32BE(0)).toBe(4);
    expect(socket.written[2].toString('utf8')).toBe('abcd');
    expect(socket.written[3].readUInt32BE(0)).toBe(2);
    expect(socket.written[4].toString('utf8')).toBe('ef');
    expect(socket.written[5].readUInt32BE(0)).toBe(0);
  });

  it('returns infected status when clamd reports a signature', async () => {
    const socket = new FakeSocket() as unknown as Socket & FakeSocket;
    const service = new TestableClamAvService(makeConfig({ 'clamav.chunkSize': 32 }), socket);

    process.nextTick(() => {
      socket.readyState = 'open';
      socket.emit('connect');
    });

    const resultPromise = service.scanStream(Readable.from([Buffer.from('payload')]));

    setImmediate(() => {
      socket.emit('data', 'stream: Eicar-Test-Signature FOUND\0');
      socket.emit('close', false);
    });

    await expect(resultPromise).resolves.toEqual({
      status: 'infected',
      signature: 'Eicar-Test-Signature',
    });
  });

  it('fails closed when scanning is disabled', async () => {
    const socket = new FakeSocket() as unknown as Socket & FakeSocket;
    const service = new TestableClamAvService(makeConfig({ 'clamav.enabled': false }), socket);

    await expect(service.scanStream(Readable.from([Buffer.from('payload')]))).rejects.toThrow(
      'ClamAV scanning is disabled',
    );
  });
});
