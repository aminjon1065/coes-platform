import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { FilesService } from '../services/files.service';
import { MinioService } from '../services/minio.service';
import { ClamAvService } from '../services/clamav.service';

interface FileUploadCompleteEvent {
  fileId: string;
  storageKey: string;
  actorId: string;
}

@Injectable()
export class FileScanListener {
  private readonly logger = new Logger(FileScanListener.name);

  constructor(
    private readonly filesService: FilesService,
    private readonly minioService: MinioService,
    private readonly clamAvService: ClamAvService,
  ) {}

  @OnEvent('file.upload_complete', { async: true })
  async handleUploadComplete(event: FileUploadCompleteEvent): Promise<void> {
    this.logger.log(`Scanning file ${event.fileId} via ClamAV (storageKey: ${event.storageKey})`);

    try {
      const objectStream = await this.minioService.getObjectStream(event.storageKey);
      const result = await this.clamAvService.scanStream(objectStream);
      await this.filesService.processScanResult(event.fileId, result.status, 'system', result.signature);
    } catch (err) {
      const reason = (err as Error).message;
      this.logger.error(`ClamAV scan failed for ${event.fileId}: ${reason}`);
      await this.filesService.processScanFailure(event.fileId, 'system', reason);
    }
  }
}
