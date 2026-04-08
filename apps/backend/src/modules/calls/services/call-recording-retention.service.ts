import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThanOrEqual, Not, Repository } from 'typeorm';
import { CallRecording, RecordingStatus } from '../entities/call-recording.entity';
import { MinioService } from '../../files/services/minio.service';
import { AuditService } from '../../audit/services/audit.service';

@Injectable()
export class CallRecordingRetentionService {
  private readonly logger = new Logger(CallRecordingRetentionService.name);
  private lastRunSummary = {
    ranAt: null as string | null,
    deletedCount: 0,
    error: null as string | null,
  };

  constructor(
    @InjectRepository(CallRecording)
    private readonly recordingsRepo: Repository<CallRecording>,
    private readonly minioService: MinioService,
    private readonly auditService: AuditService,
  ) {}

  @Cron(process.env.CALLS_RECORDING_RETENTION_CRON ?? '30 3 * * *')
  async purgeExpiredRecordings(): Promise<number> {
    return this.runRetentionCleanup(new Date());
  }

  async runRetentionCleanup(now: Date): Promise<number> {
    const expiredRecordings = await this.recordingsRepo.find({
      where: {
        expiresAt: LessThanOrEqual(now),
        status: Not(RecordingStatus.DELETED),
      },
    });

    if (expiredRecordings.length === 0) {
      this.lastRunSummary = {
        ranAt: now.toISOString(),
        deletedCount: 0,
        error: null,
      };
      return 0;
    }

    let deletedCount = 0;

    for (const recording of expiredRecordings) {
      try {
        const storageKeys = this.buildStorageKeys(recording.storageKey);
        for (const storageKey of storageKeys) {
          await this.minioService.deleteObject(storageKey);
        }

        recording.status = RecordingStatus.DELETED;
        recording.storageKey = null;
        await this.recordingsRepo.save(recording);

        await this.auditService.emit({
          action: 'call.recording_retention_deleted',
          actorId: 'system',
          resourceType: 'call_recording',
          resourceId: recording.id,
          meta: {
            sessionId: recording.sessionId,
            deletedObjectCount: storageKeys.length,
          },
        });

        deletedCount += 1;
      } catch (error) {
        this.logger.error(
          `Failed to purge expired recording ${recording.id}: ${error instanceof Error ? error.message : 'unknown error'}`,
        );
        this.lastRunSummary = {
          ranAt: now.toISOString(),
          deletedCount,
          error: error instanceof Error ? error.message : 'unknown error',
        };
      }
    }

    if (deletedCount > 0) {
      this.logger.log(`Purged ${deletedCount} expired call recordings`);
    }

    this.lastRunSummary = {
      ranAt: now.toISOString(),
      deletedCount,
      error: this.lastRunSummary.error,
    };

    return deletedCount;
  }

  getLastRunSummary() {
    return this.lastRunSummary;
  }

  private buildStorageKeys(storageKey: string | null): string[] {
    if (!storageKey) {
      return [];
    }

    const manifestKey = storageKey.replace(/\/[^/]+$/, '/manifest.json');
    return Array.from(new Set([storageKey, manifestKey]));
  }
}
