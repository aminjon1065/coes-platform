import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CallRecording, RecordingStatus } from '../entities/call-recording.entity';
import { CallRecordingRetentionService } from './call-recording-retention.service';
import { MinioService } from '../../files/services/minio.service';
import { AuditService } from '../../audit/services/audit.service';

function makeRecording(overrides: Partial<CallRecording> = {}): CallRecording {
  return Object.assign(new CallRecording(), {
    id: 'rec-1',
    sessionId: 'sess-1',
    status: RecordingStatus.READY,
    storageKey: 'recordings/cls1/rec-1/rec-1.tar',
    classification: 1,
    startedAt: new Date('2026-01-01T00:00:00Z'),
    stoppedAt: new Date('2026-01-01T01:00:00Z'),
    expiresAt: new Date('2026-02-01T00:00:00Z'),
    initiatedById: 'user-1',
    sizeBytes: '1234',
    durationSeconds: 60,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  });
}

describe('CallRecordingRetentionService', () => {
  let service: CallRecordingRetentionService;
  let recordingsRepo: jest.Mocked<Repository<CallRecording>>;
  let minioService: jest.Mocked<MinioService>;
  let auditService: jest.Mocked<AuditService>;

  beforeEach(async () => {
    recordingsRepo = {
      find: jest.fn(),
      save: jest.fn(),
    } as unknown as jest.Mocked<Repository<CallRecording>>;

    minioService = {
      deleteObject: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<MinioService>;

    auditService = {
      emit: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<AuditService>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CallRecordingRetentionService,
        { provide: getRepositoryToken(CallRecording), useValue: recordingsRepo },
        { provide: MinioService, useValue: minioService },
        { provide: AuditService, useValue: auditService },
      ],
    }).compile();

    service = module.get(CallRecordingRetentionService);
  });

  it('returns 0 when nothing is expired', async () => {
    recordingsRepo.find.mockResolvedValue([]);

    await expect(service.runRetentionCleanup(new Date('2026-03-01T00:00:00Z'))).resolves.toBe(0);
    expect(minioService.deleteObject).not.toHaveBeenCalled();
  });

  it('deletes archive and manifest for expired recordings and marks them deleted', async () => {
    const recording = makeRecording();
    recordingsRepo.find.mockResolvedValue([recording]);
    recordingsRepo.save.mockResolvedValue(recording);

    const result = await service.runRetentionCleanup(new Date('2026-03-01T00:00:00Z'));

    expect(result).toBe(1);
    expect(minioService.deleteObject).toHaveBeenCalledWith('recordings/cls1/rec-1/rec-1.tar');
    expect(minioService.deleteObject).toHaveBeenCalledWith('recordings/cls1/rec-1/manifest.json');
    expect(recording.status).toBe(RecordingStatus.DELETED);
    expect(recording.storageKey).toBeNull();
    expect(auditService.emit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'call.recording_retention_deleted', actorId: 'system' }),
    );
  });
});
