import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository, InjectDataSource } from '@nestjs/typeorm';
import { Repository, DataSource, IsNull } from 'typeorm';
import { QueryDeepPartialEntity } from 'typeorm/query-builder/QueryPartialEntity';
import { EventEmitter2 } from '@nestjs/event-emitter';

import { Document, DocumentStatus, DOCUMENT_TRANSITIONS } from '../entities/document.entity';
import { DocumentVersion } from '../entities/document-version.entity';
import { DocumentAttachment } from '../entities/document-attachment.entity';
import { DocumentType } from '../entities/document-type.entity';
import { RegistrationRecord } from '../entities/registration-record.entity';
import { AuditService } from '../../audit/services/audit.service';
import { UsersService } from '../../users/services/users.service';

import { CreateDocumentDto } from '../dto/create-document.dto';
import { UpdateDocumentDto } from '../dto/update-document.dto';
import { RegisterDocumentDto } from '../dto/register-document.dto';
import { TransitionStatusDto } from '../dto/transition-status.dto';
import { AddAttachmentDto } from '../dto/add-attachment.dto';
import { ListDocumentsDto } from '../dto/list-documents.dto';

@Injectable()
export class EdmsService {
  private readonly logger = new Logger(EdmsService.name);

  constructor(
    @InjectRepository(Document)
    private readonly documentRepo: Repository<Document>,
    @InjectRepository(DocumentVersion)
    private readonly versionRepo: Repository<DocumentVersion>,
    @InjectRepository(DocumentAttachment)
    private readonly attachmentRepo: Repository<DocumentAttachment>,
    @InjectRepository(DocumentType)
    private readonly typeRepo: Repository<DocumentType>,
    @InjectRepository(RegistrationRecord)
    private readonly registrationRepo: Repository<RegistrationRecord>,
    @InjectDataSource()
    private readonly dataSource: DataSource,
    private readonly auditService: AuditService,
    private readonly usersService: UsersService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  // ─── Create ──────────────────────────────────────────────────────────────────

  async createDocument(
    dto: CreateDocumentDto,
    actorId: string,
    actorPositionId?: string,
  ): Promise<Document> {
    const docType = await this.typeRepo.findOne({ where: { id: dto.typeId, active: true } });
    if (!docType) throw new NotFoundException(`DocumentType ${dto.typeId} not found`);

    const doc = this.documentRepo.create({
      typeId: dto.typeId,
      direction: dto.direction,
      subject: dto.subject,
      classification: dto.classification ?? docType.defaultClassification,
      senderPositionId: dto.senderPositionId ?? null,
      senderName: dto.senderName ?? null,
      externalRefNumber: dto.externalRefNumber ?? null,
      recipients: dto.recipients ?? [],
      body: dto.body ?? null,
      deadline: dto.deadline ?? null,
      relatedDocumentId: dto.relatedDocumentId ?? null,
      documentDate: dto.documentDate ?? null,
      createdById: actorId,
      createdByPositionId: actorPositionId ?? null,
      status: DocumentStatus.DRAFT,
    });

    const saved = await this.documentRepo.save(doc);

    // First version snapshot
    await this.versionRepo.save(
      this.versionRepo.create({
        documentId: saved.id,
        versionNumber: 1,
        subject: saved.subject,
        body: saved.body,
        recipients: saved.recipients,
        authorId: actorId,
        changeReason: null,
      }),
    );

    await this.auditService.emit({
      actorId,
      eventType: 'edms.document.created',
      resourceType: 'document',
      resourceId: saved.id,
      details: { typeId: saved.typeId, direction: saved.direction, subject: saved.subject },
    });

    this.eventEmitter.emit('edms.document.created', { documentId: saved.id, actorId });
    return saved;
  }

  // ─── Read ─────────────────────────────────────────────────────────────────────

  async listDocuments(
    dto: ListDocumentsDto,
    actorId: string,
    actorPositionId: string | null,
    userClearance: number,
  ): Promise<{ items: Document[]; total: number }> {
    const qb = this.documentRepo
      .createQueryBuilder('doc')
      .leftJoinAndSelect('doc.type', 'type')
      .where('doc.classification <= :clearance', { clearance: userClearance })
      .andWhere(this.buildDocumentVisibilityWhere('doc', actorPositionId), {
        actorId,
        actorPositionId,
        actorPositionIdText: actorPositionId,
      });

    if (dto.status) qb.andWhere('doc.status = :status', { status: dto.status });
    if (dto.direction) qb.andWhere('doc.direction = :direction', { direction: dto.direction });
    if (dto.typeId) qb.andWhere('doc.type_id = :typeId', { typeId: dto.typeId });
    if (dto.search)
      qb.andWhere('doc.subject ILIKE :search', { search: `%${dto.search}%` });
    if (dto.from) qb.andWhere('doc.created_at >= :from', { from: dto.from });
    if (dto.to) qb.andWhere('doc.created_at <= :to', { to: dto.to });

    qb.orderBy('doc.createdAt', 'DESC')
      .skip(dto.offset ?? 0)
      .take(dto.limit ?? 20);

    const [items, total] = await qb.getManyAndCount();
    return { items, total };
  }

  async listActiveDocumentTypes(): Promise<DocumentType[]> {
    return this.typeRepo.find({
      where: { active: true },
      order: { name: 'ASC' },
    });
  }

  async getDocument(
    id: string,
    actorId: string,
    actorPositionId: string | null,
    userClearance: number,
  ): Promise<Document> {
    const doc = await this.documentRepo.findOne({
      where: { id },
      relations: ['type', 'versions', 'attachments'],
    });
    if (!doc) throw new NotFoundException(`Document ${id} not found`);
    this.assertClearance(userClearance, doc.classification);
    this.assertDocumentVisibility(doc, actorId, actorPositionId);
    doc.attachments = (doc.attachments ?? []).filter(
      (attachment) =>
        attachment.removedAt === null && attachment.classification <= userClearance,
    );
    return doc;
  }

  // ─── Update (DRAFT only) ──────────────────────────────────────────────────────

  async updateDocument(
    id: string,
    dto: UpdateDocumentDto,
    actorId: string,
    userClearance: number,
  ): Promise<Document> {
    const doc = await this.getDocument(id, actorId, null, userClearance);
    if (doc.status !== DocumentStatus.DRAFT)
      throw new BadRequestException('Document can only be edited in DRAFT status');
    this.assertAuthorAccess(doc, actorId);

    Object.assign(doc, {
      subject: dto.subject ?? doc.subject,
      classification: dto.classification ?? doc.classification,
      senderPositionId: dto.senderPositionId ?? doc.senderPositionId,
      senderName: dto.senderName ?? doc.senderName,
      externalRefNumber: dto.externalRefNumber ?? doc.externalRefNumber,
      recipients: dto.recipients ?? doc.recipients,
      body: dto.body ?? doc.body,
      deadline: dto.deadline ?? doc.deadline,
      relatedDocumentId: dto.relatedDocumentId ?? doc.relatedDocumentId,
      documentDate: dto.documentDate ?? doc.documentDate,
    });

    const saved = await this.documentRepo.save(doc);

    // Save new version snapshot
    const lastVersion = await this.versionRepo
      .createQueryBuilder('v')
      .where('v.documentId = :id', { id })
      .orderBy('v.versionNumber', 'DESC')
      .getOne();

    await this.versionRepo.save(
      this.versionRepo.create({
        documentId: id,
        versionNumber: (lastVersion?.versionNumber ?? 0) + 1,
        subject: saved.subject,
        body: saved.body,
        recipients: saved.recipients,
        authorId: actorId,
        changeReason: dto.changeReason ?? null,
      }),
    );

    await this.auditService.emit({
      actorId,
      eventType: 'edms.document.updated',
      resourceType: 'document',
      resourceId: id,
      details: { changes: Object.keys(dto).filter((k) => dto[k as keyof UpdateDocumentDto] !== undefined) },
    });

    this.eventEmitter.emit('edms.document.updated', { documentId: id, actorId });

    return saved;
  }

  // ─── Registration ──────────────────────────────────────────────────────────────

  async registerDocument(
    id: string,
    dto: RegisterDocumentDto,
    actorId: string,
    userClearance: number,
  ): Promise<Document> {
    const doc = await this.getDocument(id, actorId, null, userClearance);
    if (doc.status !== DocumentStatus.DRAFT)
      throw new BadRequestException('Only DRAFT documents can be registered');
    this.assertAuthorAccess(doc, actorId);

    const docType = doc.type;
    const year = new Date().getFullYear();

    // Atomic sequence increment with advisory lock
    const registrationNumber = await this.dataSource.transaction(async (em) => {
      // Advisory lock scoped to (seriesCode, year) to prevent race conditions
      const lockKey = this.seriesLockKey(docType.seriesCode, year);
      await em.query(`SELECT pg_advisory_xact_lock($1)`, [lockKey]);

      const result = await em.query(
        `SELECT COALESCE(MAX(sequence_number), 0) + 1 AS next_seq
         FROM edms.registration_records
         WHERE series_code = $1 AND year = $2`,
        [docType.seriesCode, year],
      );
      const seq: number = result[0].next_seq;
      const seqPadded = String(seq).padStart(4, '0');
      const regNum = `${docType.seriesCode}-${seqPadded}/${year}`;

      await em.getRepository(RegistrationRecord).save(
        em.getRepository(RegistrationRecord).create({
          documentId: id,
          registrationNumber: regNum,
          seriesCode: docType.seriesCode,
          sequenceNumber: seq,
          year,
          registrarId: actorId,
          registrarPositionId: dto.registrarPositionId ?? null,
        }),
      );

      await em.getRepository(Document).update(id, {
        status: DocumentStatus.REGISTERED,
        registrationNumber: regNum,
        registeredAt: new Date(),
        documentDate: dto.documentDate ?? doc.documentDate,
      });

      return regNum;
    });

    await this.auditService.emit({
      actorId,
      eventType: 'edms.document.registered',
      resourceType: 'document',
      resourceId: id,
      details: { registrationNumber },
    });

    this.eventEmitter.emit('edms.document.registered', { documentId: id, registrationNumber, actorId });

    return this.documentRepo.findOne({ where: { id }, relations: ['type'] }) as Promise<Document>;
  }

  // ─── Status Transition ────────────────────────────────────────────────────────

  async transitionStatus(
    id: string,
    dto: TransitionStatusDto,
    actorId: string,
    userClearance: number,
  ): Promise<Document> {
    const doc = await this.getDocument(id, actorId, null, userClearance);
    this.assertAuthorAccess(doc, actorId);

    const allowed = DOCUMENT_TRANSITIONS[doc.status] ?? [];
    if (!allowed.includes(dto.targetStatus))
      throw new BadRequestException(
        `Cannot transition from ${doc.status} to ${dto.targetStatus}`,
      );

    const updates: QueryDeepPartialEntity<Document> = { status: dto.targetStatus };

    if (dto.targetStatus === DocumentStatus.CANCELLED) {
      updates.cancelledAt = new Date();
      updates.cancelReason = dto.reason ?? null;
    }

    if (dto.targetStatus === DocumentStatus.ARCHIVED) {
      const now = new Date();
      updates.archivedAt = now;
      updates.archivedById = actorId;
      // retention_review_date = archivedAt + docType.retentionYears
      const retentionYears = doc.type?.retentionYears ?? 5;
      const reviewDate = new Date(now);
      reviewDate.setFullYear(reviewDate.getFullYear() + retentionYears);
      updates.retentionReviewDate = reviewDate.toISOString().split('T')[0];
    }

    await this.documentRepo.update(id, updates);

    await this.auditService.emit({
      actorId,
      eventType: 'edms.document.status_changed',
      resourceType: 'document',
      resourceId: id,
      details: { from: doc.status, to: dto.targetStatus, reason: dto.reason },
    });

    this.eventEmitter.emit('edms.document.status_changed', {
      documentId: id,
      from: doc.status,
      to: dto.targetStatus,
      actorId,
    });

    return { ...doc, ...updates } as Document;
  }

  // ─── Attachments ──────────────────────────────────────────────────────────────

  async addAttachment(
    documentId: string,
    dto: AddAttachmentDto,
    actorId: string,
    userClearance: number,
  ): Promise<DocumentAttachment> {
    const doc = await this.getDocument(documentId, actorId, null, userClearance);
    this.assertAuthorAccess(doc, actorId);

    // Attachment classification cannot exceed user's clearance
    const attachClassification = dto.classification ?? doc.classification;
    this.assertClearance(userClearance, attachClassification);

    const attachment = await this.attachmentRepo.save(
      this.attachmentRepo.create({
        documentId,
        fileId: dto.fileId,
        filename: dto.filename,
        mimeType: dto.mimeType ?? null,
        fileSizeBytes: dto.fileSizeBytes ?? null,
        role: dto.role,
        classification: attachClassification,
        uploadedById: actorId,
        removedAt: null,
      }),
    );

    await this.auditService.emit({
      actorId,
      eventType: 'edms.attachment.added',
      resourceType: 'document_attachment',
      resourceId: attachment.id,
      details: { documentId, filename: dto.filename, role: dto.role },
    });

    return attachment;
  }

  async removeAttachment(
    documentId: string,
    attachmentId: string,
    actorId: string,
    userClearance: number,
  ): Promise<void> {
    const doc = await this.getDocument(documentId, actorId, null, userClearance);
    this.assertAuthorAccess(doc, actorId);

    const attachment = await this.attachmentRepo.findOne({
      where: { id: attachmentId, documentId, removedAt: IsNull() },
    });
    if (!attachment) throw new NotFoundException(`Attachment ${attachmentId} not found`);

    await this.attachmentRepo.update(attachmentId, { removedAt: new Date() });

    await this.auditService.emit({
      actorId,
      eventType: 'edms.attachment.removed',
      resourceType: 'document_attachment',
      resourceId: attachmentId,
      details: { documentId },
    });
  }

  async getVersions(
    documentId: string,
    actorId: string,
    userClearance: number,
  ): Promise<DocumentVersion[]> {
    const doc = await this.getDocument(documentId, actorId, null, userClearance);
    this.assertAuthorAccess(doc, actorId);
    return this.versionRepo.find({
      where: { documentId },
      order: { versionNumber: 'DESC' },
    });
  }

  // ─── Archive Management ───────────────────────────────────────────────────────

  /**
   * List archived documents with optional search and clearance filtering.
   * Supports pagination and optional date range on retentionReviewDate.
   */
  async listArchivedDocuments(opts: {
    search?: string;
    reviewBefore?: Date;
    limit?: number;
    offset?: number;
    userClearance: number;
  }): Promise<{ items: Document[]; total: number }> {
    const qb = this.documentRepo
      .createQueryBuilder('doc')
      .leftJoinAndSelect('doc.type', 'type')
      .where("doc.status = 'archived'")
      .andWhere('doc.classification <= :clearance', { clearance: opts.userClearance });

    if (opts.search) {
      qb.andWhere('doc.subject ILIKE :search', { search: `%${opts.search}%` });
    }
    if (opts.reviewBefore) {
      qb.andWhere('doc.retention_review_date <= :reviewBefore', { reviewBefore: opts.reviewBefore.toISOString().split('T')[0] });
    }

    const [items, total] = await qb
      .orderBy('doc.archived_at', 'DESC')
      .skip(opts.offset ?? 0)
      .take(opts.limit ?? 20)
      .getManyAndCount();

    return { items, total };
  }

  /**
   * Scheduled job: auto-archive COMPLETED documents where updated_at is older
   * than the configured threshold (default 90 days).
   * Called by a cron job — returns the count of documents archived.
   */
  async autoArchiveCompletedDocuments(olderThanDays = 90): Promise<number> {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - olderThanDays);

    const docsToArchive = await this.documentRepo
      .createQueryBuilder('doc')
      .leftJoinAndSelect('doc.type', 'type')
      .where("doc.status = 'completed'")
      .andWhere('doc.updated_at < :cutoff', { cutoff })
      .getMany();

    if (docsToArchive.length === 0) return 0;

    const now = new Date();
    for (const doc of docsToArchive) {
      const retentionYears = doc.type?.retentionYears ?? 5;
      const reviewDate = new Date(now);
      reviewDate.setFullYear(reviewDate.getFullYear() + retentionYears);

      await this.documentRepo.update(doc.id, {
        status: DocumentStatus.ARCHIVED,
        archivedAt: now,
        archivedById: 'system',
        retentionReviewDate: reviewDate.toISOString().split('T')[0],
      });

      await this.auditService.emit({
        actorId: 'system',
        eventType: 'edms.document.auto_archived',
        resourceType: 'document',
        resourceId: doc.id,
        metadata: { olderThanDays, retentionReviewDate: reviewDate.toISOString().split('T')[0] },
      });
    }

    this.logger.log(`Auto-archived ${docsToArchive.length} completed documents older than ${olderThanDays} days`);
    return docsToArchive.length;
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────────

  private assertClearance(userClearance: number, resourceClassification: number): void {
    if (userClearance < resourceClassification)
      throw new ForbiddenException(
        `Classification level ${resourceClassification} requires clearance >= ${resourceClassification}`,
      );
  }

  private assertAuthorAccess(doc: Document, actorId: string): void {
    if (doc.createdById !== actorId) {
      throw new ForbiddenException('Only the document author may modify this document');
    }
  }

  private assertDocumentVisibility(
    doc: Document,
    actorId: string,
    actorPositionId: string | null,
  ): void {
    const isRecipient = actorPositionId
      ? doc.recipients.some((recipient) => recipient.positionId === actorPositionId)
      : false;
    const isVisible =
      doc.createdById === actorId ||
      (!!actorPositionId &&
        (doc.createdByPositionId === actorPositionId ||
          doc.senderPositionId === actorPositionId ||
          isRecipient));

    if (!isVisible) {
      throw new ForbiddenException('You do not have access to this document');
    }
  }

  private buildDocumentVisibilityWhere(alias: string, actorPositionId: string | null): string {
    if (!actorPositionId) {
      return `${alias}.created_by_id = :actorId`;
    }

    return `(${alias}.created_by_id = :actorId OR ${alias}.created_by_position_id = :actorPositionId OR ${alias}.sender_position_id = :actorPositionId OR EXISTS (SELECT 1 FROM jsonb_array_elements(${alias}.recipients) recipient WHERE recipient ->> 'positionId' = :actorPositionIdText))`;
  }

  /** Deterministic 32-bit advisory lock key for (seriesCode, year) */
  private seriesLockKey(seriesCode: string, year: number): number {
    let hash = 0;
    const str = `${seriesCode}:${year}`;
    for (let i = 0; i < str.length; i++) {
      hash = (Math.imul(31, hash) + str.charCodeAt(i)) | 0;
    }
    return Math.abs(hash);
  }
}
