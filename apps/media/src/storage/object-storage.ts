import { Client as MinioClient } from 'minio';
import { createReadStream } from 'fs';
import { stat } from 'fs/promises';
import path from 'path';
import { logger } from '../logger';

export class ObjectStorage {
  private readonly client: MinioClient;
  private readonly bucket: string;
  private ensuredBucket = false;

  constructor() {
    this.bucket = process.env.MINIO_BUCKET ?? 'coescd-files';
    this.client = new MinioClient({
      endPoint: process.env.MINIO_ENDPOINT ?? 'localhost',
      port: parseInt(process.env.MINIO_PORT ?? '9000', 10),
      useSSL: process.env.MINIO_USE_SSL === 'true',
      accessKey: process.env.MINIO_ROOT_USER ?? 'minioadmin',
      secretKey: process.env.MINIO_ROOT_PASSWORD ?? 'minioadmin',
    });
  }

  async uploadFile(storageKey: string, filePath: string, mimeType: string): Promise<number> {
    await this.ensureBucketExists();

    const metadata = await stat(filePath);
    await this.client.putObject(
      this.bucket,
      storageKey,
      createReadStream(filePath),
      metadata.size,
      { 'Content-Type': mimeType },
    );

    return metadata.size;
  }

  buildRecordingStorageKey(
    classification: number,
    recordingId: string,
    filename: string,
  ): string {
    const safeName = path.posix.basename(filename);
    return `recordings/cls${classification}/${recordingId}/${safeName}`;
  }

  private async ensureBucketExists(): Promise<void> {
    if (this.ensuredBucket) {
      return;
    }

    try {
      const exists = await this.client.bucketExists(this.bucket);
      if (!exists) {
        await this.client.makeBucket(this.bucket);
        logger.info({ bucket: this.bucket }, 'Created MinIO bucket for media storage');
      }
      this.ensuredBucket = true;
    } catch (error) {
      logger.error(error, 'Failed to ensure MinIO bucket for media storage');
      throw error;
    }
  }
}
