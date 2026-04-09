import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository, InjectDataSource } from '@nestjs/typeorm';
import { Repository, DataSource, ILike } from 'typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import * as crypto from 'crypto';
import { Transform, Readable } from 'stream';
import { finished } from 'stream/promises';
import * as path from 'path';

import { FileRecord, ScanStatus } from '../entities/file-record.entity';
import { FileVersion } from '../entities/file-version.entity';
import { FileFolder } from '../entities/file-folder.entity';
import { FilePermission, PermissionAction, PermissionEffect } from '../entities/file-permission.entity';
import { FileLink, LinkedEntityType } from '../entities/file-link.entity';

import { AuditService } from '../../audit/services/audit.service';
import { MinioService } from './minio.service';

import { UploadFileDto } from '../dto/upload-file.dto';
import { ListFilesDto } from '../dto/list-files.dto';
import { CreateFolderDto } from '../dto/create-folder.dto';

/** Maximum file size: 100 MB */
const MAX_FILE_SIZE_BYTES = 100 * 1024 * 1024;

/** Maximum folder nesting depth */
const MAX_FOLDER_DEPTH = 10;

export interface UploadMetadata {
  displayName: string;
  originalFilename: string;
  mimeType: string;
  folderId: string | null;
  classification: number;
  uploadNote: string | null;
}

@Injectable()
export class FilesService {
  private readonly logger = new Logger(FilesService.name);

  constructor(
    @InjectRepository(FileRecord)
    private readonly fileRepo: Repository<FileRecord>,
    @InjectRepository(FileVersion)
    private readonly versionRepo: Repository<FileVersion>,
    @InjectRepository(FileFolder)
    private readonly folderRepo: Repository<FileFolder>,
    @InjectRepository(FilePermission)
    private readonly permissionRepo: Repository<FilePermission>,
    @InjectRepository(FileLink)
    private readonly linkRepo: Repository<FileLink>,
    @InjectDataSource()
    private readonly dataSource: DataSource,
    private readonly minioService: MinioService,
    private readonly auditService: AuditService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  // ─── Upload & Versioning ──────────────────────────────────────────────────────

  /**
   * Upload a new file. Streams bytes to MinIO while computing SHA-256 in parallel.
   * Creates FileRecord + FileVersion in a single deferred transaction.
   */
  async uploadFile(
    stream: Readable,
    meta: UploadMetadata,
    actorId: string,
    actorPositionId: string,
  ): Promise<FileRecord> {
    // Validate folder exists and classification is compatible
    if (meta.folderId) {
      const folder = await this.folderRepo.findOne({ where: { id: meta.folderId, deletedAt: null as any } });
      if (!folder) throw new NotFoundException(`Folder ${meta.folderId} not found`);
      if (meta.classification < folder.classification) {
        throw new BadRequestException(
          `File classification (${meta.classification}) cannot be lower than folder classification (${folder.classification})`,
        );
      }
    }

    const fileId = crypto.randomUUID();
    const ext = path.extname(meta.originalFilename).replace('.', '');

    // Stream to MinIO while hashing in parallel via a Transform
    let sizeBytes = 0;
    const hashStream = crypto.createHash('sha256');
    const measuringTransform = new Transform({
      transform(chunk, _enc, cb) {
        sizeBytes += chunk.length;
        if (sizeBytes > MAX_FILE_SIZE_BYTES) {
          cb(new BadRequestException(`File exceeds maximum size of ${MAX_FILE_SIZE_BYTES / (1024 * 1024)} MB`));
          return;
        }
        hashStream.update(chunk);
        cb(null, chunk);
      },
    });

    // Placeholder key — we'll rename after we know the hash
    const tempKey = `tmp/${fileId}/${Date.now()}`;
    const transformedStream = stream.pipe(measuringTransform);
    await Promise.all([
      this.minioService.uploadStream(tempKey, transformedStream, meta.mimeType),
      finished(measuringTransform, { readable: false }),
    ]);

    const sha256 = hashStream.digest('hex');
    const versionNumber = 1;
    const storageKey = this.minioService.buildStorageKey(meta.classification, fileId, versionNumber, sha256, ext);
    await this.minioService.moveObject(tempKey, storageKey);

    // Persist record + version in a deferred transaction (handles circular FK)
    const record = await this.dataSource.transaction(async (em) => {
      // Insert FileRecord (currentVersionId = null initially, deferred FK is OK)
      const rec = em.getRepository(FileRecord).create({
        id: fileId,
        displayName: meta.displayName || meta.originalFilename,
        originalFilename: meta.originalFilename,
        mimeType: meta.mimeType || null,
        folderId: meta.folderId ?? null,
        classification: meta.classification,
        ownerPositionId: actorPositionId,
        uploadedById: actorId,
        totalSizeBytes: sizeBytes,
        versionCount: 1,
        scanStatus: ScanStatus.PENDING,
        currentVersionId: null,
      });
      await em.getRepository(FileRecord).save(rec);

      // Insert FileVersion
      const ver = em.getRepository(FileVersion).create({
        fileId,
        versionNumber,
        storageKey,
        sizeBytes,
        sha256Hash: sha256,
        uploadedById: actorId,
        uploadNote: meta.uploadNote ?? null,
      });
      await em.getRepository(FileVersion).save(ver);

      // Close the deferred FK
      rec.currentVersionId = ver.id;
      await em.getRepository(FileRecord).save(rec);

      return rec;
    });

    await this.auditService.emit({
      eventType: 'FILES_FILE_UPLOADED',
      resourceType: 'file',
      resourceId: fileId,
      actorId,
      metadata: { originalFilename: meta.originalFilename, sizeBytes, classification: meta.classification },
    });

    this.eventEmitter.emit('file.upload_complete', {
      fileId,
      storageKey,
      actorId,
    });

    return this.fileRepo.findOne({ where: { id: fileId } }) as Promise<FileRecord>;
  }

  /**
   * Upload a new version of an existing file.
   * Caller must have WRITE permission (or be the owner).
   */
  async uploadNewVersion(
    fileId: string,
    stream: Readable,
    uploadNote: string | null,
    actorId: string,
    actorPositionId: string,
    actorClearance: number,
  ): Promise<FileRecord> {
    const file = await this.getFileOrThrow(fileId);
    await this.assertFileAccess(file, actorPositionId, actorClearance, PermissionAction.WRITE);

    const ext = path.extname(file.originalFilename).replace('.', '');
    const versionNumber = file.versionCount + 1;

    let sizeBytes = 0;
    const hashStream = crypto.createHash('sha256');
    const measuringTransform = new Transform({
      transform(chunk, _enc, cb) {
        sizeBytes += chunk.length;
        if (sizeBytes > MAX_FILE_SIZE_BYTES) {
          cb(new BadRequestException(`File exceeds maximum size of ${MAX_FILE_SIZE_BYTES / (1024 * 1024)} MB`));
          return;
        }
        hashStream.update(chunk);
        cb(null, chunk);
      },
    });

    const tempKey = `tmp/${fileId}/${Date.now()}`;
    const transformedStream = stream.pipe(measuringTransform);
    await Promise.all([
      this.minioService.uploadStream(
        tempKey,
        transformedStream,
        file.mimeType ?? 'application/octet-stream',
      ),
      finished(measuringTransform, { readable: false }),
    ]);
    const sha256 = hashStream.digest('hex');
    const storageKey = this.minioService.buildStorageKey(file.classification, fileId, versionNumber, sha256, ext);
    await this.minioService.moveObject(tempKey, storageKey);

    const updatedRecord = await this.dataSource.transaction(async (em) => {
      const ver = em.getRepository(FileVersion).create({
        fileId,
        versionNumber,
        storageKey,
        sizeBytes,
        sha256Hash: sha256,
        uploadedById: actorId,
        uploadNote: uploadNote ?? null,
      });
      await em.getRepository(FileVersion).save(ver);

      await em.getRepository(FileRecord).update(fileId, {
        currentVersionId: ver.id,
        versionCount: versionNumber,
        totalSizeBytes: sizeBytes,
        scanStatus: ScanStatus.PENDING,
        scannedAt: null,
        updatedAt: new Date(),
      });

      return em.getRepository(FileRecord).findOne({ where: { id: fileId } }) as Promise<FileRecord>;
    });

    await this.auditService.emit({
      eventType: 'FILES_NEW_VERSION_UPLOADED',
      resourceType: 'file',
      resourceId: fileId,
      actorId,
      metadata: { versionNumber, sizeBytes },
    });

    this.eventEmitter.emit('file.upload_complete', { fileId, storageKey, actorId });

    return updatedRecord;
  }

  async getVersions(fileId: string, actorPositionId: string, actorClearance: number): Promise<FileVersion[]> {
    const file = await this.getFileOrThrow(fileId);
    await this.assertFileAccess(file, actorPositionId, actorClearance, PermissionAction.READ);
    return this.versionRepo.find({
      where: { fileId },
      order: { versionNumber: 'DESC' },
    });
  }

  // ─── Read & List ──────────────────────────────────────────────────────────────

  async listFiles(
    dto: ListFilesDto,
    actorPositionId: string,
    actorClearance: number,
  ): Promise<[FileRecord[], number]> {
    const effectiveClearance = dto.maxClassification !== undefined
      ? Math.min(dto.maxClassification, actorClearance)
      : actorClearance;

    const qb = this.fileRepo
      .createQueryBuilder('f')
      .where('f.classification <= :clearance', { clearance: effectiveClearance })
      .andWhere('f.deleted_at IS NULL');

    if (dto.folderId) {
      qb.andWhere('f.folder_id = :folderId', { folderId: dto.folderId });
    }
    if (dto.search) {
      qb.andWhere(
        '(f.display_name ILIKE :search OR f.original_filename ILIKE :search)',
        { search: `%${dto.search}%` },
      );
    }
    if (dto.scanStatus) {
      qb.andWhere('f.scan_status = :scanStatus', { scanStatus: dto.scanStatus });
    }

    return qb
      .orderBy('f.created_at', 'DESC')
      .limit(dto.limit ?? 20)
      .offset(dto.offset ?? 0)
      .getManyAndCount();
  }

  async getFile(fileId: string, actorPositionId: string, actorClearance: number): Promise<FileRecord> {
    const file = await this.getFileOrThrow(fileId);
    await this.assertFileAccess(file, actorPositionId, actorClearance, PermissionAction.READ);
    return file;
  }

  /**
   * Generate a pre-signed download URL. Audit-logged on every call.
   * Blocked if the file hasn't passed virus scan.
   */
  async getPresignedDownloadUrl(
    fileId: string,
    actorId: string,
    actorPositionId: string,
    actorClearance: number,
    expirySeconds = 3600,
  ): Promise<{ url: string; expiresInSeconds: number }> {
    const file = await this.getFileOrThrow(fileId);
    await this.assertFileAccess(file, actorPositionId, actorClearance, PermissionAction.DOWNLOAD);

    if (file.scanStatus !== ScanStatus.CLEAN) {
      throw new BadRequestException(
        `File cannot be downloaded: scan status is '${file.scanStatus}'. Wait for virus scan completion.`,
      );
    }
    if (!file.currentVersionId || !file.currentVersion) {
      throw new BadRequestException('File has no stored version');
    }

    const url = await this.minioService.presignedGetUrl(file.currentVersion.storageKey, expirySeconds);

    await this.auditService.emit({
      eventType: 'FILES_PRESIGNED_URL_GENERATED',
      resourceType: 'file',
      resourceId: fileId,
      actorId,
      metadata: { positionId: actorPositionId, expiresInSeconds: expirySeconds },
    });

    return { url, expiresInSeconds: expirySeconds };
  }

  // ─── Folders ──────────────────────────────────────────────────────────────────

  async createFolder(
    dto: CreateFolderDto,
    actorId: string,
    actorPositionId: string,
    actorClearance: number,
  ): Promise<FileFolder> {
    const classification = dto.classification ?? 1;

    // Validate parent if provided
    if (dto.parentId) {
      const parent = await this.folderRepo.findOne({ where: { id: dto.parentId, deletedAt: null as any } });
      if (!parent) throw new NotFoundException(`Parent folder ${dto.parentId} not found`);
      if (actorClearance < parent.classification) {
        throw new ForbiddenException('Clearance insufficient for parent folder');
      }
      if (classification < parent.classification) {
        throw new BadRequestException('Folder classification cannot be lower than parent folder classification');
      }
      // Check depth
      const depth = await this.getFolderDepth(dto.parentId);
      if (depth >= MAX_FOLDER_DEPTH) {
        throw new BadRequestException(`Maximum folder nesting depth of ${MAX_FOLDER_DEPTH} exceeded`);
      }
    }

    const folder = await this.dataSource.transaction(async (em) => {
      const f = em.getRepository(FileFolder).create({
        name: dto.name,
        parentId: dto.parentId ?? null,
        ownerPositionId: actorPositionId,
        classification,
        description: dto.description ?? null,
        createdById: actorId,
      });
      await em.getRepository(FileFolder).save(f);

      // Populate closure table: all ancestor rows + self-reference
      if (dto.parentId) {
        await em.query(
          `INSERT INTO files.folder_closure (ancestor_id, descendant_id, depth)
           SELECT ancestor_id, $1, depth + 1
           FROM   files.folder_closure
           WHERE  descendant_id = $2
           UNION ALL
           SELECT $1, $1, 0`,
          [f.id, dto.parentId],
        );
      } else {
        await em.query(
          `INSERT INTO files.folder_closure (ancestor_id, descendant_id, depth) VALUES ($1, $1, 0)`,
          [f.id],
        );
      }

      return f;
    });

    await this.auditService.emit({
      eventType: 'FILES_FOLDER_CREATED',
      resourceType: 'folder',
      resourceId: folder.id,
      actorId,
      metadata: { name: dto.name, parentId: dto.parentId ?? null, classification },
    });

    return folder;
  }

  async listFolderContents(
    folderId: string | null,
    actorClearance: number,
  ): Promise<{ folders: FileFolder[]; files: FileRecord[] }> {
    const folderQb = this.folderRepo
      .createQueryBuilder('f')
      .where('f.classification <= :clearance', { clearance: actorClearance })
      .andWhere('f.deleted_at IS NULL');

    if (folderId) {
      folderQb.andWhere('f.parent_id = :folderId', { folderId });
    } else {
      folderQb.andWhere('f.parent_id IS NULL');
    }

    const folders = await folderQb.orderBy('f.name', 'ASC').getMany();

    const fileQb = this.fileRepo
      .createQueryBuilder('r')
      .where('r.classification <= :clearance', { clearance: actorClearance })
      .andWhere('r.deleted_at IS NULL');

    if (folderId) {
      fileQb.andWhere('r.folder_id = :folderId', { folderId });
    } else {
      fileQb.andWhere('r.folder_id IS NULL');
    }

    const files = await fileQb.orderBy('r.display_name', 'ASC').getMany();

    return { folders, files };
  }

  async deleteFolder(folderId: string, actorId: string): Promise<void> {
    const folder = await this.folderRepo.findOne({ where: { id: folderId, deletedAt: null as any } });
    if (!folder) throw new NotFoundException(`Folder ${folderId} not found`);

    // Block if folder contains non-deleted files
    const fileCount = await this.fileRepo.count({
      where: { folderId, deletedAt: null as any },
    });
    if (fileCount > 0) {
      throw new BadRequestException(`Cannot delete folder: it contains ${fileCount} file(s). Move or delete them first.`);
    }

    folder.deletedAt = new Date();
    await this.folderRepo.save(folder);

    await this.auditService.emit({
      eventType: 'FILES_FOLDER_DELETED',
      resourceType: 'folder',
      resourceId: folderId,
      actorId,
    });
  }

  // ─── Permissions ─────────────────────────────────────────────────────────────

  async grantPermission(
    fileId: string,
    granteePositionId: string,
    action: PermissionAction,
    effect: PermissionEffect,
    actorId: string,
    actorPositionId: string,
    actorClearance: number,
    expiresAt?: Date,
  ): Promise<FilePermission> {
    const file = await this.getFileOrThrow(fileId);
    await this.assertFileAccess(file, actorPositionId, actorClearance, PermissionAction.SHARE);

    // Upsert permission
    const existing = await this.permissionRepo.findOne({
      where: { fileId, granteePositionId, action },
    });

    if (existing) {
      existing.effect = effect;
      existing.grantedById = actorId;
      existing.expiresAt = expiresAt ?? null;
      existing.revokedAt = null;
      return this.permissionRepo.save(existing);
    }

    const perm = this.permissionRepo.create({
      fileId,
      granteePositionId,
      action,
      effect,
      grantedById: actorId,
      expiresAt: expiresAt ?? null,
    });
    return this.permissionRepo.save(perm);
  }

  async revokePermission(permissionId: string, actorId: string): Promise<void> {
    const perm = await this.permissionRepo.findOne({ where: { id: permissionId } });
    if (!perm) throw new NotFoundException(`Permission ${permissionId} not found`);
    perm.revokedAt = new Date();
    await this.permissionRepo.save(perm);

    await this.auditService.emit({
      eventType: 'FILES_PERMISSION_REVOKED',
      resourceType: 'file_permission',
      resourceId: permissionId,
      actorId,
      metadata: { fileId: perm.fileId, granteePositionId: perm.granteePositionId, action: perm.action },
    });
  }

  async listPermissions(
    fileId: string,
    actorPositionId: string,
    actorClearance: number,
  ): Promise<FilePermission[]> {
    const file = await this.getFileOrThrow(fileId);
    await this.assertFileAccess(file, actorPositionId, actorClearance, PermissionAction.READ);
    return this.permissionRepo.find({
      where: { fileId, revokedAt: null as any },
      order: { createdAt: 'DESC' },
    });
  }

  // ─── File Links ───────────────────────────────────────────────────────────────

  async linkFile(
    fileId: string,
    linkedEntityId: string,
    linkedEntityType: LinkedEntityType,
    actorId: string,
    actorPositionId: string,
    actorClearance: number,
  ): Promise<FileLink> {
    const file = await this.getFileOrThrow(fileId);
    await this.assertFileAccess(file, actorPositionId, actorClearance, PermissionAction.READ);

    const existing = await this.linkRepo.findOne({
      where: { fileId, linkedEntityId, linkedEntityType },
    });
    if (existing) return existing;

    return this.linkRepo.save(
      this.linkRepo.create({ fileId, linkedEntityId, linkedEntityType, linkedById: actorId }),
    );
  }

  async getLinksForEntity(
    linkedEntityId: string,
    linkedEntityType: LinkedEntityType,
    actorPositionId: string,
    actorClearance: number,
  ): Promise<FileLink[]> {
    const links = await this.linkRepo.find({
      where: { linkedEntityId, linkedEntityType },
      relations: ['file'],
    });

    const accessibleLinks: FileLink[] = [];
    for (const link of links) {
      const file = link.file;
      if (!file || file.deletedAt) {
        continue;
      }

      try {
        await this.assertFileAccess(
          file,
          actorPositionId,
          actorClearance,
          PermissionAction.READ,
        );
        accessibleLinks.push(link);
      } catch (error) {
        if (!(error instanceof ForbiddenException)) {
          throw error;
        }
      }
    }

    return accessibleLinks;
  }

  async unlinkFile(
    fileId: string,
    linkedEntityId: string,
    linkedEntityType: LinkedEntityType,
    actorId: string,
  ): Promise<void> {
    const link = await this.linkRepo.findOne({ where: { fileId, linkedEntityId, linkedEntityType } });
    if (!link) return; // idempotent
    await this.linkRepo.remove(link);
  }

  // ─── Scan Results (called by FileScanListener) ────────────────────────────────

  async processScanResult(
    fileId: string,
    result: 'clean' | 'infected',
    actorId: string,
    threatSignature?: string,
  ): Promise<void> {
    const file = await this.fileRepo.findOne({ where: { id: fileId } });
    if (!file) return; // File may have been deleted already

    file.scanStatus = result === 'clean' ? ScanStatus.CLEAN : ScanStatus.INFECTED;
    file.scannedAt = new Date();

    if (result === 'infected') {
      this.logger.warn(`Infected file detected: ${fileId} — quarantining`);
      file.deletedAt = new Date(); // soft-delete
      const versions = await this.versionRepo.find({ where: { fileId } });
      const storageKeys = Array.from(
        new Set(
          [
            ...versions.map((version) => version.storageKey),
            file.currentVersion?.storageKey,
          ].filter((value): value is string => Boolean(value)),
        ),
      );

      for (const storageKey of storageKeys) {
        try {
          await this.minioService.deleteObject(storageKey);
        } catch (err) {
          this.logger.error(`Failed to delete infected file from MinIO: ${(err as Error).message}`);
        }
      }

      await this.auditService.emit({
        eventType: 'FILES_INFECTED_FILE_QUARANTINED',
        resourceType: 'file',
        resourceId: fileId,
        actorId,
        metadata: { deletedAt: file.deletedAt, threatSignature, deletedObjectCount: storageKeys.length },
      });
    }

    await this.fileRepo.save(file);
    this.eventEmitter.emit('file.scan_complete', { fileId, result });
  }

  async processScanFailure(
    fileId: string,
    actorId: string,
    reason: string,
  ): Promise<void> {
    const file = await this.fileRepo.findOne({ where: { id: fileId } });
    if (!file) return;

    file.scanStatus = ScanStatus.SCAN_FAILED;
    file.scannedAt = new Date();
    await this.fileRepo.save(file);

    await this.auditService.emit({
      eventType: 'FILES_SCAN_FAILED',
      resourceType: 'file',
      resourceId: fileId,
      actorId,
      metadata: { reason },
    });

    this.eventEmitter.emit('file.scan_complete', { fileId, result: 'scan_failed', reason });
  }

  // ─── Soft Delete ──────────────────────────────────────────────────────────────

  async deleteFile(fileId: string, actorId: string, actorPositionId: string, actorClearance: number): Promise<void> {
    const file = await this.getFileOrThrow(fileId);
    await this.assertFileAccess(file, actorPositionId, actorClearance, PermissionAction.DELETE);

    file.deletedAt = new Date();
    await this.fileRepo.save(file);

    await this.auditService.emit({
      eventType: 'FILES_FILE_DELETED',
      resourceType: 'file',
      resourceId: fileId,
      actorId,
    });
  }

  // ─── Private Helpers ─────────────────────────────────────────────────────────

  private async getFileOrThrow(fileId: string): Promise<FileRecord> {
    const file = await this.fileRepo.findOne({ where: { id: fileId, deletedAt: null as any } });
    if (!file) throw new NotFoundException(`File ${fileId} not found`);
    return file;
  }

  /**
   * Authorization check: user must satisfy all of the following:
   * 1. Clearance level >= file classification
   * 2. Is the file owner position OR has an active, non-expired, non-revoked ALLOW permission
   *    for the required action with no overriding DENY permission
   */
  private async assertFileAccess(
    file: FileRecord,
    positionId: string,
    clearance: number,
    requiredAction: PermissionAction,
  ): Promise<void> {
    if (clearance < file.classification) {
      throw new ForbiddenException(
        `Clearance level ${clearance} is insufficient for file classification ${file.classification}`,
      );
    }

    // Owners always have full access (except explicit DENY overrides them too)
    if (file.ownerPositionId === positionId) return;

    // Check explicit permissions
    const now = new Date();
    const permissions = await this.permissionRepo.find({ where: { fileId: file.id, granteePositionId: positionId, revokedAt: null as any } });
    const active = permissions.filter(
      (p) => p.revokedAt === null && (p.expiresAt === null || p.expiresAt > now),
    );

    const hasDeny = active.some((p) => p.action === requiredAction && p.effect === PermissionEffect.DENY);
    if (hasDeny) {
      throw new ForbiddenException(`Access denied: explicit DENY permission for action '${requiredAction}'`);
    }

    const hasAllow =
      active.some((p) => p.action === requiredAction && p.effect === PermissionEffect.ALLOW) ||
      // READ/DOWNLOAD implied by any ALLOW permission of higher privilege
      (requiredAction === PermissionAction.READ &&
        active.some((p) => [PermissionAction.WRITE, PermissionAction.DOWNLOAD, PermissionAction.DELETE].includes(p.action) && p.effect === PermissionEffect.ALLOW));

    if (!hasAllow) {
      throw new ForbiddenException(`No permission for action '${requiredAction}' on this file`);
    }
  }

  private async getFolderDepth(folderId: string): Promise<number> {
    const result = await this.dataSource.query<Array<{ depth: number }>>(
      `SELECT MAX(depth) as depth FROM files.folder_closure WHERE descendant_id = $1`,
      [folderId],
    );
    return result[0]?.depth ?? 0;
  }
}
