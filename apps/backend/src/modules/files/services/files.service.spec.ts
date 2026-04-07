import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken, getDataSourceToken } from '@nestjs/typeorm';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Readable } from 'stream';

import { FilesService } from './files.service';
import { FileRecord, ScanStatus } from '../entities/file-record.entity';
import { FileVersion } from '../entities/file-version.entity';
import { FileFolder } from '../entities/file-folder.entity';
import {
  FilePermission,
  PermissionAction,
  PermissionEffect,
} from '../entities/file-permission.entity';
import { FileLink, LinkedEntityType } from '../entities/file-link.entity';
import { AuditService } from '../../audit/services/audit.service';
import { MinioService } from './minio.service';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeStream(content = 'hello'): Readable {
  return Readable.from([Buffer.from(content)]);
}

function makeFile(overrides: Partial<FileRecord> = {}): FileRecord {
  return {
    id: 'file-1',
    displayName: 'test.pdf',
    originalFilename: 'test.pdf',
    mimeType: 'application/pdf',
    folderId: null,
    folder: null,
    classification: 1,
    ownerPositionId: 'pos-owner',
    uploadedById: 'user-1',
    currentVersionId: 'ver-1',
    currentVersion: {
      id: 'ver-1',
      fileId: 'file-1',
      versionNumber: 1,
      storageKey: 'cls1/file-1/1/abc123.pdf',
      sizeBytes: 1024,
      sha256Hash: 'abc123',
      uploadedById: 'user-1',
      uploadNote: null,
      createdAt: new Date(),
      file: null as any,
    },
    totalSizeBytes: 1024,
    versionCount: 1,
    scanStatus: ScanStatus.CLEAN,
    scannedAt: new Date(),
    deletedAt: null,
    versions: [],
    permissions: [],
    links: [],
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as FileRecord;
}

function makeFolder(overrides: Partial<FileFolder> = {}): FileFolder {
  return {
    id: 'folder-1',
    name: 'Test Folder',
    parentId: null,
    parent: null,
    children: [],
    ownerPositionId: 'pos-owner',
    classification: 1,
    description: null,
    createdById: 'user-1',
    deletedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as FileFolder;
}

function makePermission(overrides: Partial<FilePermission> = {}): FilePermission {
  return {
    id: 'perm-1',
    fileId: 'file-1',
    file: null as any,
    granteePositionId: 'pos-grantee',
    action: PermissionAction.READ,
    effect: PermissionEffect.ALLOW,
    grantedById: 'user-1',
    expiresAt: null,
    revokedAt: null,
    createdAt: new Date(),
    ...overrides,
  } as FilePermission;
}

// ─── Mock factory ─────────────────────────────────────────────────────────────

function buildQueryBuilderMock(results: any[] = [], count = 0) {
  const qb: any = {
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    innerJoin: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    offset: jest.fn().mockReturnThis(),
    getMany: jest.fn().mockResolvedValue(results),
    getManyAndCount: jest.fn().mockResolvedValue([results, count]),
  };
  return qb;
}

// ─── Suite ───────────────────────────────────────────────────────────────────

describe('FilesService', () => {
  let service: FilesService;

  // Repository mocks
  let fileRepo: jest.Mocked<any>;
  let versionRepo: jest.Mocked<any>;
  let folderRepo: jest.Mocked<any>;
  let permissionRepo: jest.Mocked<any>;
  let linkRepo: jest.Mocked<any>;

  // Infrastructure mocks
  let dataSource: jest.Mocked<any>;
  let minioService: jest.Mocked<any>;
  let auditService: jest.Mocked<any>;
  let eventEmitter: jest.Mocked<any>;

  beforeEach(async () => {
    // Build fresh query-builder per test so .where chains don't leak
    fileRepo = {
      findOne: jest.fn(),
      find: jest.fn(),
      count: jest.fn(),
      save: jest.fn(),
      create: jest.fn(),
      createQueryBuilder: jest.fn().mockReturnValue(buildQueryBuilderMock()),
    };
    versionRepo = {
      find: jest.fn(),
      findOne: jest.fn(),
      save: jest.fn(),
      create: jest.fn(),
    };
    folderRepo = {
      findOne: jest.fn(),
      find: jest.fn(),
      count: jest.fn(),
      save: jest.fn(),
      create: jest.fn(),
      createQueryBuilder: jest.fn().mockReturnValue(buildQueryBuilderMock()),
    };
    permissionRepo = {
      findOne: jest.fn(),
      find: jest.fn(),
      save: jest.fn(),
      create: jest.fn(),
    };
    linkRepo = {
      findOne: jest.fn(),
      find: jest.fn(),
      save: jest.fn(),
      create: jest.fn(),
      remove: jest.fn(),
      createQueryBuilder: jest.fn().mockReturnValue(buildQueryBuilderMock()),
    };

    dataSource = {
      query: jest.fn().mockResolvedValue([{ depth: 0 }]),
      transaction: jest.fn(),
      createQueryRunner: jest.fn(),
    };

    minioService = {
      uploadStream: jest.fn(async (_key: string, stream: Readable) => {
        for await (const _chunk of stream) {
          // Consume the stream to mirror MinIO upload semantics.
        }
        return 'etag-abc';
      }),
      moveObject: jest.fn().mockResolvedValue(undefined),
      presignedGetUrl: jest.fn().mockResolvedValue('https://minio/presigned'),
      deleteObject: jest.fn().mockResolvedValue(undefined),
      buildStorageKey: jest.fn().mockReturnValue('cls1/file-1/1/abc.pdf'),
    };

    auditService = { emit: jest.fn().mockResolvedValue(undefined) };
    eventEmitter = { emit: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FilesService,
        { provide: getRepositoryToken(FileRecord), useValue: fileRepo },
        { provide: getRepositoryToken(FileVersion), useValue: versionRepo },
        { provide: getRepositoryToken(FileFolder), useValue: folderRepo },
        { provide: getRepositoryToken(FilePermission), useValue: permissionRepo },
        { provide: getRepositoryToken(FileLink), useValue: linkRepo },
        { provide: getDataSourceToken(), useValue: dataSource },
        { provide: MinioService, useValue: minioService },
        { provide: AuditService, useValue: auditService },
        { provide: EventEmitter2, useValue: eventEmitter },
      ],
    }).compile();

    service = module.get<FilesService>(FilesService);
  });

  // ─── uploadFile ─────────────────────────────────────────────────────────────

  describe('uploadFile', () => {
    const meta = {
      displayName: 'test.pdf',
      originalFilename: 'test.pdf',
      mimeType: 'application/pdf',
      folderId: null,
      classification: 1,
      uploadNote: null,
    };

    it('happy path: streams file, persists record+version, emits events', async () => {
      const savedFile = makeFile();
      // transaction returns the saved record
      dataSource.transaction.mockImplementation(async (cb: any) => {
        const em = {
          getRepository: jest.fn().mockReturnValue({
            create: jest.fn().mockImplementation((d) => d),
            save: jest.fn().mockResolvedValue({}),
            update: jest.fn().mockResolvedValue({}),
            findOne: jest.fn().mockResolvedValue(savedFile),
          }),
          query: jest.fn().mockResolvedValue([]),
        };
        return cb(em);
      });
      fileRepo.findOne.mockResolvedValue(savedFile);

      const result = await service.uploadFile(makeStream(), meta, 'user-1', 'pos-1');

      expect(minioService.uploadStream).toHaveBeenCalled();
      expect(minioService.moveObject).toHaveBeenCalledWith(
        expect.stringContaining('tmp/'),
        'cls1/file-1/1/abc.pdf',
      );
      expect(dataSource.transaction).toHaveBeenCalled();
      expect(auditService.emit).toHaveBeenCalledWith(
        expect.objectContaining({ eventType: 'FILES_FILE_UPLOADED' }),
      );
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'file.upload_complete',
        expect.objectContaining({ actorId: 'user-1' }),
      );
      expect(result).toBe(savedFile);
    });

    it('throws BadRequestException when file exceeds MAX_FILE_SIZE', async () => {
      // Create a stream with a fake large chunk (> 100 MB marker)
      // We simulate the size check by making uploadStream reject with the error
      // that the Transform emits.
      const bigBuffer = Buffer.alloc(101 * 1024 * 1024); // 101 MB
      const bigStream = Readable.from([bigBuffer]);

      await expect(
        service.uploadFile(bigStream, meta, 'user-1', 'pos-1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('validates folder exists when folderId is provided', async () => {
      folderRepo.findOne.mockResolvedValue(null);

      await expect(
        service.uploadFile(makeStream(), { ...meta, folderId: 'non-existent' }, 'user-1', 'pos-1'),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequestException when file classification < folder classification', async () => {
      folderRepo.findOne.mockResolvedValue(makeFolder({ classification: 3 }));

      await expect(
        service.uploadFile(makeStream(), { ...meta, folderId: 'folder-1', classification: 1 }, 'user-1', 'pos-1'),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ─── uploadNewVersion ────────────────────────────────────────────────────────

  describe('uploadNewVersion', () => {
    it('happy path: creates new version, resets scan status, emits events', async () => {
      const file = makeFile({ versionCount: 1, ownerPositionId: 'pos-1' });
      fileRepo.findOne.mockResolvedValue(file);
      permissionRepo.find.mockResolvedValue([]);

      const updatedFile = makeFile({ versionCount: 2, scanStatus: ScanStatus.PENDING });
      dataSource.transaction.mockImplementation(async (cb: any) => {
        const em = {
          getRepository: jest.fn().mockReturnValue({
            create: jest.fn().mockImplementation((d) => ({ id: 'ver-2', ...d })),
            save: jest.fn().mockResolvedValue({}),
            update: jest.fn().mockResolvedValue({}),
            findOne: jest.fn().mockResolvedValue(updatedFile),
          }),
        };
        return cb(em);
      });

      const result = await service.uploadNewVersion(
        'file-1', makeStream(), 'new version note', 'user-1', 'pos-1', 2,
      );

      expect(result.versionCount).toBe(2);
      expect(result.scanStatus).toBe(ScanStatus.PENDING);
      expect(minioService.moveObject).toHaveBeenCalledWith(
        expect.stringContaining('tmp/file-1/'),
        'cls1/file-1/1/abc.pdf',
      );
      expect(auditService.emit).toHaveBeenCalledWith(
        expect.objectContaining({ eventType: 'FILES_NEW_VERSION_UPLOADED' }),
      );
    });

    it('throws ForbiddenException when actorClearance < file.classification', async () => {
      const file = makeFile({ classification: 3, ownerPositionId: 'pos-owner' });
      fileRepo.findOne.mockResolvedValue(file);
      permissionRepo.find.mockResolvedValue([]);

      await expect(
        service.uploadNewVersion('file-1', makeStream(), null, 'user-1', 'pos-low', 1),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  // ─── getVersions ─────────────────────────────────────────────────────────────

  describe('getVersions', () => {
    it('returns versions ordered by versionNumber DESC', async () => {
      const file = makeFile({ ownerPositionId: 'pos-1' });
      fileRepo.findOne.mockResolvedValue(file);
      permissionRepo.find.mockResolvedValue([]);
      const versions = [
        { id: 'v2', versionNumber: 2 },
        { id: 'v1', versionNumber: 1 },
      ];
      versionRepo.find.mockResolvedValue(versions);

      const result = await service.getVersions('file-1', 'pos-1', 2);

      expect(versionRepo.find).toHaveBeenCalledWith(
        expect.objectContaining({ where: { fileId: 'file-1' } }),
      );
      expect(result).toHaveLength(2);
    });
  });

  // ─── listFiles ───────────────────────────────────────────────────────────────

  describe('listFiles', () => {
    it('returns paginated file list filtered by clearance', async () => {
      const files = [makeFile()];
      const qb = buildQueryBuilderMock(files, 1);
      fileRepo.createQueryBuilder.mockReturnValue(qb);

      const result = await service.listFiles(
        { limit: 10, offset: 0 },
        'pos-1',
        2,
      );

      expect(result[0]).toHaveLength(1);
      expect(result[1]).toBe(1);
      expect(qb.where).toHaveBeenCalledWith(
        expect.stringContaining('classification'),
        expect.objectContaining({ clearance: 2 }),
      );
    });
  });

  // ─── getFile ─────────────────────────────────────────────────────────────────

  describe('getFile', () => {
    it('returns file for owner', async () => {
      const file = makeFile({ ownerPositionId: 'pos-1' });
      fileRepo.findOne.mockResolvedValue(file);
      permissionRepo.find.mockResolvedValue([]);

      const result = await service.getFile('file-1', 'pos-1', 2);

      expect(result).toBe(file);
    });

    it('throws NotFoundException for unknown file id', async () => {
      fileRepo.findOne.mockResolvedValue(null);

      await expect(service.getFile('missing', 'pos-1', 2)).rejects.toThrow(NotFoundException);
    });
  });

  // ─── getPresignedDownloadUrl ──────────────────────────────────────────────────

  describe('getPresignedDownloadUrl', () => {
    it('happy path: returns presigned URL for a clean file', async () => {
      const file = makeFile({ scanStatus: ScanStatus.CLEAN, ownerPositionId: 'pos-1' });
      fileRepo.findOne.mockResolvedValue(file);
      permissionRepo.find.mockResolvedValue([]);
      minioService.presignedGetUrl.mockResolvedValue('https://minio/signed');

      const result = await service.getPresignedDownloadUrl('file-1', 'user-1', 'pos-1', 2);

      expect(result.url).toBe('https://minio/signed');
      expect(result.expiresInSeconds).toBe(3600);
      expect(auditService.emit).toHaveBeenCalledWith(
        expect.objectContaining({ eventType: 'FILES_PRESIGNED_URL_GENERATED' }),
      );
    });

    it('throws BadRequestException when scan_status is pending (not clean)', async () => {
      const file = makeFile({ scanStatus: ScanStatus.PENDING, ownerPositionId: 'pos-1' });
      fileRepo.findOne.mockResolvedValue(file);
      permissionRepo.find.mockResolvedValue([]);

      await expect(
        service.getPresignedDownloadUrl('file-1', 'user-1', 'pos-1', 2),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException when scan_status is infected', async () => {
      const file = makeFile({ scanStatus: ScanStatus.INFECTED, ownerPositionId: 'pos-1' });
      fileRepo.findOne.mockResolvedValue(file);
      permissionRepo.find.mockResolvedValue([]);

      await expect(
        service.getPresignedDownloadUrl('file-1', 'user-1', 'pos-1', 2),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws ForbiddenException when actorClearance < file.classification', async () => {
      const file = makeFile({ classification: 3, ownerPositionId: 'pos-owner' });
      fileRepo.findOne.mockResolvedValue(file);
      permissionRepo.find.mockResolvedValue([]);

      await expect(
        service.getPresignedDownloadUrl('file-1', 'user-1', 'pos-low', 1),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  // ─── createFolder ─────────────────────────────────────────────────────────────

  describe('createFolder', () => {
    it('happy path: creates a root folder', async () => {
      const folder = makeFolder();
      dataSource.transaction.mockImplementation(async (cb: any) => {
        const em = {
          getRepository: jest.fn().mockReturnValue({
            create: jest.fn().mockReturnValue(folder),
            save: jest.fn().mockResolvedValue(folder),
          }),
          query: jest.fn().mockResolvedValue([]),
        };
        return cb(em);
      });

      const result = await service.createFolder(
        { name: 'Test Folder', classification: 1 },
        'user-1',
        'pos-1',
        2,
      );

      expect(result).toBe(folder);
      expect(auditService.emit).toHaveBeenCalledWith(
        expect.objectContaining({ eventType: 'FILES_FOLDER_CREATED' }),
      );
    });

    it('throws NotFoundException when parent folder does not exist', async () => {
      folderRepo.findOne.mockResolvedValue(null);

      await expect(
        service.createFolder({ name: 'Child', parentId: 'non-existent' }, 'user-1', 'pos-1', 2),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws ForbiddenException when actor clearance < parent classification', async () => {
      folderRepo.findOne.mockResolvedValue(makeFolder({ classification: 3 }));

      await expect(
        service.createFolder({ name: 'Child', parentId: 'folder-1' }, 'user-1', 'pos-1', 1),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  // ─── listFolderContents ───────────────────────────────────────────────────────

  describe('listFolderContents', () => {
    it('returns folders and files at the requested level', async () => {
      const folderQb = buildQueryBuilderMock([makeFolder()], 1);
      const fileQb = buildQueryBuilderMock([makeFile()], 1);

      // First call → folder qb, second → file qb
      folderRepo.createQueryBuilder.mockReturnValue(folderQb);
      fileRepo.createQueryBuilder.mockReturnValue(fileQb);

      const result = await service.listFolderContents('folder-1', 2);

      expect(result.folders).toHaveLength(1);
      expect(result.files).toHaveLength(1);
    });
  });

  // ─── deleteFolder ─────────────────────────────────────────────────────────────

  describe('deleteFolder', () => {
    it('soft-deletes an empty folder', async () => {
      const folder = makeFolder();
      folderRepo.findOne.mockResolvedValue(folder);
      fileRepo.count.mockResolvedValue(0);
      folderRepo.save.mockResolvedValue(folder);

      await service.deleteFolder('folder-1', 'user-1');

      expect(folder.deletedAt).not.toBeNull();
      expect(auditService.emit).toHaveBeenCalledWith(
        expect.objectContaining({ eventType: 'FILES_FOLDER_DELETED' }),
      );
    });

    it('throws BadRequestException when folder contains files', async () => {
      folderRepo.findOne.mockResolvedValue(makeFolder());
      fileRepo.count.mockResolvedValue(3);

      await expect(service.deleteFolder('folder-1', 'user-1')).rejects.toThrow(BadRequestException);
    });

    it('throws NotFoundException when folder does not exist', async () => {
      folderRepo.findOne.mockResolvedValue(null);

      await expect(service.deleteFolder('ghost', 'user-1')).rejects.toThrow(NotFoundException);
    });
  });

  // ─── grantPermission ──────────────────────────────────────────────────────────

  describe('grantPermission', () => {
    it('creates a new permission when none exists', async () => {
      const file = makeFile({ ownerPositionId: 'pos-owner' });
      fileRepo.findOne.mockResolvedValue(file);
      permissionRepo.find.mockResolvedValue([]);
      permissionRepo.findOne.mockResolvedValue(null);
      const perm = makePermission();
      permissionRepo.create.mockReturnValue(perm);
      permissionRepo.save.mockResolvedValue(perm);

      const result = await service.grantPermission(
        'file-1', 'pos-grantee', PermissionAction.READ, PermissionEffect.ALLOW,
        'user-1', 'pos-owner', 2,
      );

      expect(permissionRepo.save).toHaveBeenCalled();
      expect(result).toBe(perm);
    });

    it('updates an existing permission (upsert)', async () => {
      const file = makeFile({ ownerPositionId: 'pos-owner' });
      fileRepo.findOne.mockResolvedValue(file);
      permissionRepo.find.mockResolvedValue([]);
      const existing = makePermission({ effect: PermissionEffect.DENY });
      permissionRepo.findOne.mockResolvedValue(existing);
      permissionRepo.save.mockResolvedValue({ ...existing, effect: PermissionEffect.ALLOW });

      const result = await service.grantPermission(
        'file-1', 'pos-grantee', PermissionAction.READ, PermissionEffect.ALLOW,
        'user-1', 'pos-owner', 2,
      );

      expect(result.effect).toBe(PermissionEffect.ALLOW);
    });
  });

  // ─── revokePermission ─────────────────────────────────────────────────────────

  describe('revokePermission', () => {
    it('sets revokedAt timestamp', async () => {
      const perm = makePermission();
      permissionRepo.findOne.mockResolvedValue(perm);
      permissionRepo.save.mockResolvedValue(perm);

      await service.revokePermission('perm-1', 'user-1');

      expect(perm.revokedAt).not.toBeNull();
      expect(auditService.emit).toHaveBeenCalledWith(
        expect.objectContaining({ eventType: 'FILES_PERMISSION_REVOKED' }),
      );
    });

    it('throws NotFoundException when permission does not exist', async () => {
      permissionRepo.findOne.mockResolvedValue(null);

      await expect(service.revokePermission('ghost', 'user-1')).rejects.toThrow(NotFoundException);
    });
  });

  // ─── listPermissions ──────────────────────────────────────────────────────────

  describe('listPermissions', () => {
    it('returns active permissions for a file', async () => {
      const file = makeFile({ ownerPositionId: 'pos-1' });
      fileRepo.findOne.mockResolvedValue(file);
      permissionRepo.find.mockResolvedValue([makePermission()]);

      const result = await service.listPermissions('file-1', 'pos-1', 2);

      expect(result).toHaveLength(1);
    });
  });

  // ─── linkFile ─────────────────────────────────────────────────────────────────

  describe('linkFile', () => {
    it('creates a new link', async () => {
      const file = makeFile({ ownerPositionId: 'pos-1' });
      fileRepo.findOne.mockResolvedValue(file);
      permissionRepo.find.mockResolvedValue([]);
      linkRepo.findOne.mockResolvedValue(null);
      const link = {
        id: 'link-1',
        fileId: 'file-1',
        linkedEntityId: 'task-1',
        linkedEntityType: LinkedEntityType.TASK,
        linkedById: 'user-1',
        linkedAt: new Date(),
      };
      linkRepo.create.mockReturnValue(link);
      linkRepo.save.mockResolvedValue(link);

      const result = await service.linkFile(
        'file-1', 'task-1', LinkedEntityType.TASK, 'user-1', 'pos-1', 2,
      );

      expect(linkRepo.save).toHaveBeenCalled();
      expect(result.linkedEntityId).toBe('task-1');
    });

    it('returns existing link (idempotent)', async () => {
      const file = makeFile({ ownerPositionId: 'pos-1' });
      fileRepo.findOne.mockResolvedValue(file);
      permissionRepo.find.mockResolvedValue([]);
      const existing = { id: 'link-1', fileId: 'file-1', linkedEntityId: 'task-1', linkedEntityType: LinkedEntityType.TASK };
      linkRepo.findOne.mockResolvedValue(existing);

      const result = await service.linkFile(
        'file-1', 'task-1', LinkedEntityType.TASK, 'user-1', 'pos-1', 2,
      );

      expect(linkRepo.save).not.toHaveBeenCalled();
      expect(result).toBe(existing);
    });
  });

  // ─── getLinksForEntity ────────────────────────────────────────────────────────

  describe('getLinksForEntity', () => {
    it('returns links for entity respecting classification filter', async () => {
      const links = [{ id: 'link-1' }];
      const qb = buildQueryBuilderMock(links);
      linkRepo.createQueryBuilder.mockReturnValue(qb);

      const result = await service.getLinksForEntity('task-1', LinkedEntityType.TASK, 2);

      expect(result).toHaveLength(1);
      expect(qb.andWhere).toHaveBeenCalledWith(
        expect.stringContaining('classification'),
        expect.objectContaining({ clearance: 2 }),
      );
    });
  });

  // ─── unlinkFile ───────────────────────────────────────────────────────────────

  describe('unlinkFile', () => {
    it('removes the link', async () => {
      const link = { id: 'link-1' };
      linkRepo.findOne.mockResolvedValue(link);
      linkRepo.remove.mockResolvedValue(undefined);

      await service.unlinkFile('file-1', 'task-1', LinkedEntityType.TASK, 'user-1');

      expect(linkRepo.remove).toHaveBeenCalledWith(link);
    });

    it('is idempotent when link does not exist', async () => {
      linkRepo.findOne.mockResolvedValue(null);

      await expect(
        service.unlinkFile('file-1', 'task-1', LinkedEntityType.TASK, 'user-1'),
      ).resolves.toBeUndefined();

      expect(linkRepo.remove).not.toHaveBeenCalled();
    });
  });

  // ─── processScanResult ────────────────────────────────────────────────────────

  describe('processScanResult', () => {
    it('marks file as CLEAN and emits scan_complete event', async () => {
      const file = makeFile({ scanStatus: ScanStatus.PENDING });
      fileRepo.findOne.mockResolvedValue(file);
      fileRepo.save.mockResolvedValue(file);

      await service.processScanResult('file-1', 'clean', 'system');

      expect(file.scanStatus).toBe(ScanStatus.CLEAN);
      expect(file.deletedAt).toBeNull();
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'file.scan_complete',
        expect.objectContaining({ result: 'clean' }),
      );
    });

    it('quarantines infected file: soft-deletes, removes from MinIO, emits audit', async () => {
      const file = makeFile({
        scanStatus: ScanStatus.PENDING,
        currentVersion: {
          id: 'ver-1',
          storageKey: 'cls1/file-1/1/abc.pdf',
        } as FileVersion,
      });
      fileRepo.findOne.mockResolvedValue(file);
      versionRepo.find.mockResolvedValue([
        {
          id: 'ver-1',
          storageKey: 'cls1/file-1/1/abc.pdf',
        },
        {
          id: 'ver-2',
          storageKey: 'cls1/file-1/2/def.pdf',
        },
      ]);
      fileRepo.save.mockResolvedValue(file);

      await service.processScanResult('file-1', 'infected', 'system', 'Eicar-Test-Signature');

      expect(file.scanStatus).toBe(ScanStatus.INFECTED);
      expect(file.deletedAt).not.toBeNull();
      expect(minioService.deleteObject).toHaveBeenCalledWith('cls1/file-1/1/abc.pdf');
      expect(minioService.deleteObject).toHaveBeenCalledWith('cls1/file-1/2/def.pdf');
      expect(auditService.emit).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: 'FILES_INFECTED_FILE_QUARANTINED',
          metadata: expect.objectContaining({ threatSignature: 'Eicar-Test-Signature' }),
        }),
      );
    });

    it('does nothing gracefully when file no longer exists', async () => {
      fileRepo.findOne.mockResolvedValue(null);

      await expect(
        service.processScanResult('ghost', 'clean', 'system'),
      ).resolves.toBeUndefined();
    });
  });

  describe('processScanFailure', () => {
    it('marks file as SCAN_FAILED and emits audit + completion event', async () => {
      const file = makeFile({ scanStatus: ScanStatus.PENDING });
      fileRepo.findOne.mockResolvedValue(file);
      fileRepo.save.mockResolvedValue(file);

      await service.processScanFailure('file-1', 'system', 'ClamAV timed out');

      expect(file.scanStatus).toBe(ScanStatus.SCAN_FAILED);
      expect(auditService.emit).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: 'FILES_SCAN_FAILED',
          metadata: expect.objectContaining({ reason: 'ClamAV timed out' }),
        }),
      );
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'file.scan_complete',
        expect.objectContaining({ result: 'scan_failed', reason: 'ClamAV timed out' }),
      );
    });

    it('is idempotent when the file is already gone', async () => {
      fileRepo.findOne.mockResolvedValue(null);

      await expect(
        service.processScanFailure('ghost', 'system', 'missing object'),
      ).resolves.toBeUndefined();
    });
  });

  // ─── deleteFile ───────────────────────────────────────────────────────────────

  describe('deleteFile', () => {
    it('soft-deletes a file the actor owns', async () => {
      const file = makeFile({ ownerPositionId: 'pos-1' });
      fileRepo.findOne.mockResolvedValue(file);
      permissionRepo.find.mockResolvedValue([]);
      fileRepo.save.mockResolvedValue(file);

      await service.deleteFile('file-1', 'user-1', 'pos-1', 2);

      expect(file.deletedAt).not.toBeNull();
      expect(auditService.emit).toHaveBeenCalledWith(
        expect.objectContaining({ eventType: 'FILES_FILE_DELETED' }),
      );
    });

    it('throws ForbiddenException when actor clearance < file classification', async () => {
      const file = makeFile({ classification: 3, ownerPositionId: 'pos-owner' });
      fileRepo.findOne.mockResolvedValue(file);
      permissionRepo.find.mockResolvedValue([]);

      await expect(
        service.deleteFile('file-1', 'user-low', 'pos-low', 1),
      ).rejects.toThrow(ForbiddenException);
    });

    it('throws NotFoundException when file does not exist', async () => {
      fileRepo.findOne.mockResolvedValue(null);

      await expect(
        service.deleteFile('ghost', 'user-1', 'pos-1', 2),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ─── classification guard (assertFileAccess) ─────────────────────────────────

  describe('classification guard', () => {
    it('throws ForbiddenException via getFile when actorClearance < file.classification', async () => {
      const file = makeFile({ classification: 2, ownerPositionId: 'pos-owner' });
      fileRepo.findOne.mockResolvedValue(file);
      permissionRepo.find.mockResolvedValue([]);

      await expect(service.getFile('file-1', 'pos-low', 1)).rejects.toThrow(ForbiddenException);
    });

    it('grants access when actor is owner regardless of clearance level matching classification', async () => {
      // Owner with exactly matching clearance should always pass
      const file = makeFile({ classification: 1, ownerPositionId: 'pos-1' });
      fileRepo.findOne.mockResolvedValue(file);
      permissionRepo.find.mockResolvedValue([]);

      await expect(service.getFile('file-1', 'pos-1', 1)).resolves.toBe(file);
    });
  });
});
