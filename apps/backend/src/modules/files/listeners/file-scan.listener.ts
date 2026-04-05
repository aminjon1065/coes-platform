import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { FilesService } from '../services/files.service';

interface FileUploadCompleteEvent {
  fileId: string;
  storageKey: string;
  actorId: string;
}

/**
 * Virus scan listener (stub).
 *
 * Listens for file.upload_complete and marks the file as 'clean'.
 *
 * TODO: Replace the stub scan with a real ClamAV integration:
 *   1. Fetch the stream from MinIO via minioService.getObject()
 *   2. Pipe through node-clamav (or TCP socket to clamd)
 *   3. Call filesService.processScanResult(fileId, result)
 */
@Injectable()
export class FileScanListener {
  private readonly logger = new Logger(FileScanListener.name);

  constructor(private readonly filesService: FilesService) {}

  @OnEvent('file.upload_complete', { async: true })
  async handleUploadComplete(event: FileUploadCompleteEvent): Promise<void> {
    this.logger.log(`[ClamAV stub] Scanning file ${event.fileId} (storageKey: ${event.storageKey})`);

    // Stub: immediately mark as clean
    // In production: await clamavClient.scan(stream) → infected | clean
    await this.filesService.processScanResult(event.fileId, 'clean', 'system');
  }
}
