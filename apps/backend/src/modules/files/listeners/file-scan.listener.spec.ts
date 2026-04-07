import { Readable } from 'stream';

import { FileScanListener } from './file-scan.listener';
import { FilesService } from '../services/files.service';
import { MinioService } from '../services/minio.service';
import { ClamAvService } from '../services/clamav.service';

describe('FileScanListener', () => {
  let listener: FileScanListener;
  let filesService: jest.Mocked<Pick<FilesService, 'processScanResult' | 'processScanFailure'>>;
  let minioService: jest.Mocked<Pick<MinioService, 'getObjectStream'>>;
  let clamAvService: jest.Mocked<Pick<ClamAvService, 'scanStream'>>;

  beforeEach(() => {
    filesService = {
      processScanResult: jest.fn().mockResolvedValue(undefined),
      processScanFailure: jest.fn().mockResolvedValue(undefined),
    };
    minioService = {
      getObjectStream: jest.fn().mockResolvedValue(Readable.from([Buffer.from('payload')])),
    };
    clamAvService = {
      scanStream: jest.fn().mockResolvedValue({ status: 'clean' }),
    };

    listener = new FileScanListener(
      filesService as unknown as FilesService,
      minioService as unknown as MinioService,
      clamAvService as unknown as ClamAvService,
    );
  });

  it('processes clean scan results', async () => {
    await listener.handleUploadComplete({
      fileId: 'file-1',
      storageKey: 'cls1/file-1/1/abc.pdf',
      actorId: 'user-1',
    });

    expect(minioService.getObjectStream).toHaveBeenCalledWith('cls1/file-1/1/abc.pdf');
    expect(clamAvService.scanStream).toHaveBeenCalled();
    expect(filesService.processScanResult).toHaveBeenCalledWith('file-1', 'clean', 'system', undefined);
  });

  it('passes threat signatures through for infected files', async () => {
    clamAvService.scanStream.mockResolvedValue({ status: 'infected', signature: 'Eicar-Test-Signature' });

    await listener.handleUploadComplete({
      fileId: 'file-1',
      storageKey: 'cls1/file-1/1/abc.pdf',
      actorId: 'user-1',
    });

    expect(filesService.processScanResult).toHaveBeenCalledWith(
      'file-1',
      'infected',
      'system',
      'Eicar-Test-Signature',
    );
  });

  it('marks scan failures as fail-closed instead of allowing the file', async () => {
    clamAvService.scanStream.mockRejectedValue(new Error('ClamAV unavailable'));

    await listener.handleUploadComplete({
      fileId: 'file-1',
      storageKey: 'cls1/file-1/1/abc.pdf',
      actorId: 'user-1',
    });

    expect(filesService.processScanResult).not.toHaveBeenCalled();
    expect(filesService.processScanFailure).toHaveBeenCalledWith('file-1', 'system', 'ClamAV unavailable');
  });
});
