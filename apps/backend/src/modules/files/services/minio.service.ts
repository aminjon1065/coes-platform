import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Client as MinioClient } from 'minio';
import { Readable } from 'stream';

@Injectable()
export class MinioService implements OnModuleInit {
  private readonly logger = new Logger(MinioService.name);
  private client: MinioClient;
  private bucket: string;

  constructor(private readonly config: ConfigService) {}

  async onModuleInit(): Promise<void> {
    this.bucket = this.config.get<string>('minio.bucket', 'coescd-files');

    this.client = new MinioClient({
      endPoint:  this.config.get<string>('minio.endPoint', 'localhost'),
      port:      this.config.get<number>('minio.port', 9000),
      useSSL:    this.config.get<boolean>('minio.useSSL', false),
      accessKey: this.config.get<string>('minio.accessKey', 'minioadmin'),
      secretKey: this.config.get<string>('minio.secretKey', 'minioadmin'),
    });

    await this.ensureBucketExists();
  }

  private async ensureBucketExists(): Promise<void> {
    try {
      const exists = await this.client.bucketExists(this.bucket);
      if (!exists) {
        await this.client.makeBucket(this.bucket);
        this.logger.log(`Created MinIO bucket: ${this.bucket}`);
      }
    } catch (err) {
      // Log but don't crash startup — MinIO may be temporarily unavailable
      this.logger.error(`MinIO bucket check failed: ${(err as Error).message}`);
    }
  }

  /**
   * Build deterministic object key.
   * Format: cls{n}/{fileId}/{versionNumber}/{sha256}.{ext}
   */
  buildStorageKey(
    classification: number,
    fileId: string,
    versionNumber: number,
    sha256: string,
    ext: string,
  ): string {
    const safeSha = sha256.slice(0, 16); // truncate for key readability; full hash stored in DB
    const dotExt = ext ? `.${ext.replace(/^\./, '')}` : '';
    return `cls${classification}/${fileId}/${versionNumber}/${safeSha}${dotExt}`;
  }

  /**
   * Upload a readable stream to MinIO.
   * Returns the ETag of the stored object.
   */
  async uploadStream(
    storageKey: string,
    stream: Readable,
    mimeType: string,
    sizeBytes?: number,
  ): Promise<string> {
    const result = await this.client.putObject(
      this.bucket,
      storageKey,
      stream,
      sizeBytes,
      { 'Content-Type': mimeType },
    );
    return result.etag;
  }

  /**
   * Generate a pre-signed GET URL (default expiry: 1 hour).
   * Used for secure file downloads — URL expires and is single-use compatible.
   */
  async presignedGetUrl(storageKey: string, expirySeconds = 3600): Promise<string> {
    return this.client.presignedGetObject(this.bucket, storageKey, expirySeconds);
  }

  /**
   * Generate a pre-signed PUT URL for direct browser upload (default: 15 min).
   */
  async presignedPutUrl(storageKey: string, expirySeconds = 900): Promise<string> {
    return this.client.presignedPutObject(this.bucket, storageKey, expirySeconds);
  }

  /** Remove an object (used for infected file cleanup). */
  async deleteObject(storageKey: string): Promise<void> {
    await this.client.removeObject(this.bucket, storageKey);
  }

  /** Get object stats (size in bytes, etag). */
  async statObject(storageKey: string): Promise<{ size: number; etag: string }> {
    const stat = await this.client.statObject(this.bucket, storageKey);
    return { size: stat.size, etag: stat.etag };
  }
}
