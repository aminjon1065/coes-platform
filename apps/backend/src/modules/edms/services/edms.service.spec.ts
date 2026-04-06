import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken, getDataSourceToken } from '@nestjs/typeorm';
import {
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';

import { EdmsService } from './edms.service';
import { Document, DocumentStatus, DocumentDirection } from '../entities/document.entity';
import { DocumentVersion } from '../entities/document-version.entity';
import { DocumentAttachment, AttachmentRole } from '../entities/document-attachment.entity';
import { DocumentType } from '../entities/document-type.entity';
import { RegistrationRecord } from '../entities/registration-record.entity';
import { AuditService } from '../../audit/services/audit.service';
import { UsersService } from '../../users/services/users.service';

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeDocType(overrides: Partial<DocumentType> = {}): DocumentType {
  return {
    id: 'type-1',
    name: 'Incoming Correspondence',
    nameRu: null,
    nameTg: null,
    seriesCode: 'ВС',
    defaultClassification: 1,
    requiresResolution: false,
    requiresApproval: false,
    defaultDeadlineDays: null,
    retentionYears: 5,
    active: true,
    createdAt: new Date('2025-01-01'),
    updatedAt: new Date('2025-01-01'),
    ...overrides,
  } as DocumentType;
}

function makeDocument(overrides: Partial<Document> = {}): Document {
  return {
    id: 'doc-1',
    typeId: 'type-1',
    type: makeDocType(),
    status: DocumentStatus.DRAFT,
    direction: DocumentDirection.INCOMING,
    subject: 'Test subject',
    registrationNumber: null,
    registeredAt: null,
    documentDate: null,
    classification: 1,
    senderPositionId: null,
    senderName: null,
    externalRefNumber: null,
    recipients: [],
    body: null,
    deadline: null,
    relatedDocumentId: null,
    createdById: 'user-1',
    createdByPositionId: null,
    cancelledAt: null,
    cancelReason: null,
    archivedAt: null,
    archivedById: null,
    retentionReviewDate: null,
    versions: [],
    attachments: [],
    createdAt: new Date('2025-06-01'),
    updatedAt: new Date('2025-06-01'),
    ...overrides,
  } as Document;
}

function makeVersion(overrides: Partial<DocumentVersion> = {}): DocumentVersion {
  return {
    id: 'ver-1',
    documentId: 'doc-1',
    document: {} as Document,
    versionNumber: 1,
    subject: 'Test subject',
    body: null,
    recipients: [],
    authorId: 'user-1',
    changeReason: null,
    createdAt: new Date('2025-06-01'),
    ...overrides,
  } as DocumentVersion;
}

function makeAttachment(overrides: Partial<DocumentAttachment> = {}): DocumentAttachment {
  return {
    id: 'att-1',
    documentId: 'doc-1',
    document: {} as Document,
    fileId: 'file-uuid-1',
    filename: 'report.pdf',
    mimeType: 'application/pdf',
    fileSizeBytes: 102400,
    role: AttachmentRole.PRIMARY_BODY,
    classification: 1,
    uploadedById: 'user-1',
    removedAt: null,
    createdAt: new Date('2025-06-01'),
    ...overrides,
  } as DocumentAttachment;
}

// ─── Mock factories ──────────────────────────────────────────────────────────

const mockQueryBuilder = () => {
  const qb: any = {
    leftJoinAndSelect: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
    getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
    getOne: jest.fn().mockResolvedValue(null),
    getMany: jest.fn().mockResolvedValue([]),
  };
  return qb;
};

function makeRepoMock() {
  return {
    findOne: jest.fn(),
    find: jest.fn(),
    save: jest.fn(),
    update: jest.fn(),
    create: jest.fn((entity) => entity),
    createQueryBuilder: jest.fn(() => mockQueryBuilder()),
  };
}

// ─── Test Suite ──────────────────────────────────────────────────────────────

describe('EdmsService', () => {
  let service: EdmsService;
  let documentRepo: ReturnType<typeof makeRepoMock>;
  let versionRepo: ReturnType<typeof makeRepoMock>;
  let attachmentRepo: ReturnType<typeof makeRepoMock>;
  let typeRepo: ReturnType<typeof makeRepoMock>;
  let registrationRepo: ReturnType<typeof makeRepoMock>;
  let auditService: { emit: jest.Mock };
  let eventEmitter: { emit: jest.Mock };
  let dataSource: { transaction: jest.Mock };

  beforeEach(async () => {
    documentRepo = makeRepoMock();
    versionRepo = makeRepoMock();
    attachmentRepo = makeRepoMock();
    typeRepo = makeRepoMock();
    registrationRepo = makeRepoMock();
    auditService = { emit: jest.fn().mockResolvedValue(undefined) };
    eventEmitter = { emit: jest.fn() };
    dataSource = { transaction: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EdmsService,
        { provide: getRepositoryToken(Document), useValue: documentRepo },
        { provide: getRepositoryToken(DocumentVersion), useValue: versionRepo },
        { provide: getRepositoryToken(DocumentAttachment), useValue: attachmentRepo },
        { provide: getRepositoryToken(DocumentType), useValue: typeRepo },
        { provide: getRepositoryToken(RegistrationRecord), useValue: registrationRepo },
        { provide: getDataSourceToken(), useValue: dataSource },
        { provide: AuditService, useValue: auditService },
        { provide: UsersService, useValue: {} },
        { provide: EventEmitter2, useValue: eventEmitter },
      ],
    }).compile();

    service = module.get<EdmsService>(EdmsService);
  });

  // ─── createDocument ─────────────────────────────────────────────────────────

  describe('createDocument', () => {
    it('should create a document and first version snapshot on happy path', async () => {
      const docType = makeDocType();
      const savedDoc = makeDocument();
      typeRepo.findOne.mockResolvedValue(docType);
      documentRepo.save.mockResolvedValue(savedDoc);
      versionRepo.save.mockResolvedValue(makeVersion());

      const dto = {
        typeId: 'type-1',
        direction: DocumentDirection.INCOMING,
        subject: 'Test subject',
      };

      const result = await service.createDocument(dto as any, 'user-1', 'pos-1');

      expect(typeRepo.findOne).toHaveBeenCalledWith({ where: { id: 'type-1', active: true } });
      expect(documentRepo.save).toHaveBeenCalled();
      expect(versionRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ versionNumber: 1, authorId: 'user-1' }),
      );
      expect(auditService.emit).toHaveBeenCalledWith(
        expect.objectContaining({ eventType: 'edms.document.created' }),
      );
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'edms.document.created',
        expect.objectContaining({ documentId: savedDoc.id }),
      );
      expect(result).toBe(savedDoc);
    });

    it('should throw NotFoundException when DocumentType does not exist', async () => {
      typeRepo.findOne.mockResolvedValue(null);

      await expect(
        service.createDocument({ typeId: 'nonexistent' } as any, 'user-1'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should inherit defaultClassification from DocumentType when dto.classification is omitted', async () => {
      const docType = makeDocType({ defaultClassification: 2 });
      typeRepo.findOne.mockResolvedValue(docType);
      const capturedCreate = jest.fn((entity) => entity);
      documentRepo.create = capturedCreate;
      documentRepo.save.mockResolvedValue(makeDocument({ classification: 2 }));
      versionRepo.save.mockResolvedValue(makeVersion());

      await service.createDocument(
        { typeId: 'type-1', direction: DocumentDirection.INTERNAL, subject: 'S' } as any,
        'user-1',
      );

      const createdPayload = capturedCreate.mock.calls[0][0];
      expect(createdPayload.classification).toBe(2);
    });
  });

  // ─── listDocuments ──────────────────────────────────────────────────────────

  describe('listDocuments', () => {
    it('should return paginated results with clearance filter applied', async () => {
      const docs = [makeDocument()];
      const qb = mockQueryBuilder();
      qb.getManyAndCount.mockResolvedValue([docs, 1]);
      documentRepo.createQueryBuilder.mockReturnValue(qb);

      const result = await service.listDocuments({} as any, 'user-1', 2);

      expect(documentRepo.createQueryBuilder).toHaveBeenCalledWith('doc');
      expect(qb.where).toHaveBeenCalledWith('doc.classification <= :clearance', { clearance: 2 });
      expect(result).toEqual({ items: docs, total: 1 });
    });

    it('should apply optional filters when provided in dto', async () => {
      const qb = mockQueryBuilder();
      qb.getManyAndCount.mockResolvedValue([[], 0]);
      documentRepo.createQueryBuilder.mockReturnValue(qb);

      await service.listDocuments(
        { status: DocumentStatus.REGISTERED, search: 'budget', typeId: 'type-1' } as any,
        'user-1',
        3,
      );

      expect(qb.andWhere).toHaveBeenCalledWith('doc.status = :status', {
        status: DocumentStatus.REGISTERED,
      });
      expect(qb.andWhere).toHaveBeenCalledWith('doc.subject ILIKE :search', {
        search: '%budget%',
      });
    });
  });

  // ─── getDocument ────────────────────────────────────────────────────────────

  describe('getDocument', () => {
    it('should return document when found and clearance is sufficient', async () => {
      const doc = makeDocument({ classification: 1 });
      documentRepo.findOne.mockResolvedValue(doc);

      const result = await service.getDocument('doc-1', 2);

      expect(documentRepo.findOne).toHaveBeenCalledWith({
        where: { id: 'doc-1' },
        relations: ['type', 'versions', 'attachments'],
      });
      expect(result).toBe(doc);
    });

    it('should throw NotFoundException when document does not exist', async () => {
      documentRepo.findOne.mockResolvedValue(null);

      await expect(service.getDocument('no-such-id', 3)).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException when userClearance is below document classification', async () => {
      const doc = makeDocument({ classification: 3 });
      documentRepo.findOne.mockResolvedValue(doc);

      await expect(service.getDocument('doc-1', 1)).rejects.toThrow(ForbiddenException);
    });
  });

  // ─── updateDocument ─────────────────────────────────────────────────────────

  describe('updateDocument', () => {
    it('should save changes and create a new version snapshot', async () => {
      const doc = makeDocument({ status: DocumentStatus.DRAFT });
      documentRepo.findOne.mockResolvedValue(doc);
      const savedDoc = { ...doc, subject: 'Updated subject' };
      documentRepo.save.mockResolvedValue(savedDoc);

      const versionQb = mockQueryBuilder();
      versionQb.getOne.mockResolvedValue(makeVersion({ versionNumber: 1 }));
      versionRepo.createQueryBuilder.mockReturnValue(versionQb);
      versionRepo.save.mockResolvedValue(makeVersion({ versionNumber: 2 }));

      const dto = { subject: 'Updated subject', changeReason: 'Fixed title' };
      const result = await service.updateDocument('doc-1', dto as any, 'user-1', 2);

      expect(documentRepo.save).toHaveBeenCalled();
      expect(versionRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ versionNumber: 2, changeReason: 'Fixed title' }),
      );
      expect(auditService.emit).toHaveBeenCalledWith(
        expect.objectContaining({ eventType: 'edms.document.updated' }),
      );
      expect(result.subject).toBe('Updated subject');
    });

    it('should increment version number based on last existing version', async () => {
      const doc = makeDocument({ status: DocumentStatus.DRAFT });
      documentRepo.findOne.mockResolvedValue(doc);
      documentRepo.save.mockResolvedValue(doc);

      const versionQb = mockQueryBuilder();
      versionQb.getOne.mockResolvedValue(makeVersion({ versionNumber: 3 }));
      versionRepo.createQueryBuilder.mockReturnValue(versionQb);
      versionRepo.save.mockResolvedValue({});

      await service.updateDocument('doc-1', {} as any, 'user-1', 2);

      expect(versionRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ versionNumber: 4 }),
      );
    });

    it('should throw BadRequestException when document is not in DRAFT status', async () => {
      const doc = makeDocument({ status: DocumentStatus.REGISTERED });
      documentRepo.findOne.mockResolvedValue(doc);

      await expect(
        service.updateDocument('doc-1', { subject: 'X' } as any, 'user-1', 2),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw ForbiddenException when user lacks clearance for the document', async () => {
      const doc = makeDocument({ classification: 3 });
      documentRepo.findOne.mockResolvedValue(doc);

      await expect(
        service.updateDocument('doc-1', {} as any, 'user-1', 1),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  // ─── registerDocument ───────────────────────────────────────────────────────

  describe('registerDocument', () => {
    it('should assign a formatted registration number and transition to REGISTERED', async () => {
      const doc = makeDocument({ status: DocumentStatus.DRAFT });
      documentRepo.findOne
        .mockResolvedValueOnce(doc)           // getDocument call inside registerDocument
        .mockResolvedValueOnce({ ...doc, status: DocumentStatus.REGISTERED, registrationNumber: 'ВС-0001/2026' });

      dataSource.transaction.mockImplementation(async (cb: any) => {
        const em = {
          query: jest
            .fn()
            .mockResolvedValueOnce(undefined)                   // advisory lock
            .mockResolvedValueOnce([{ next_seq: 1 }]),          // sequence query
          getRepository: jest.fn().mockReturnValue({
            save: jest.fn().mockResolvedValue({}),
            create: jest.fn((e) => e),
          }),
        };
        return cb(em);
      });

      const dto = { registrarPositionId: 'pos-1' };
      const result = await service.registerDocument('doc-1', dto as any, 'user-1', 2);

      expect(dataSource.transaction).toHaveBeenCalled();
      expect(auditService.emit).toHaveBeenCalledWith(
        expect.objectContaining({ eventType: 'edms.document.registered' }),
      );
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'edms.document.registered',
        expect.objectContaining({ documentId: 'doc-1' }),
      );
      expect(result).toBeDefined();
    });

    it('should throw BadRequestException when document is not in DRAFT status', async () => {
      const doc = makeDocument({ status: DocumentStatus.REGISTERED });
      documentRepo.findOne.mockResolvedValue(doc);

      await expect(
        service.registerDocument('doc-1', {} as any, 'user-1', 2),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw NotFoundException when document does not exist', async () => {
      documentRepo.findOne.mockResolvedValue(null);

      await expect(
        service.registerDocument('nonexistent', {} as any, 'user-1', 2),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ─── transitionStatus ───────────────────────────────────────────────────────

  describe('transitionStatus', () => {
    it('should allow DRAFT → CANCELLED transition and set cancelledAt', async () => {
      const doc = makeDocument({ status: DocumentStatus.DRAFT });
      documentRepo.findOne.mockResolvedValue(doc);
      documentRepo.update.mockResolvedValue(undefined);

      const dto = { targetStatus: DocumentStatus.CANCELLED, reason: 'No longer needed' };
      const result = await service.transitionStatus('doc-1', dto as any, 'user-1', 2);

      expect(documentRepo.update).toHaveBeenCalledWith(
        'doc-1',
        expect.objectContaining({
          status: DocumentStatus.CANCELLED,
          cancelReason: 'No longer needed',
        }),
      );
      expect(auditService.emit).toHaveBeenCalledWith(
        expect.objectContaining({ eventType: 'edms.document.status_changed' }),
      );
      expect(result.status).toBe(DocumentStatus.CANCELLED);
    });

    it('should allow COMPLETED → ARCHIVED and set archivedAt + retentionReviewDate', async () => {
      const doc = makeDocument({
        status: DocumentStatus.COMPLETED,
        type: makeDocType({ retentionYears: 10 }),
      });
      documentRepo.findOne.mockResolvedValue(doc);
      documentRepo.update.mockResolvedValue(undefined);

      const dto = { targetStatus: DocumentStatus.ARCHIVED };
      const result = await service.transitionStatus('doc-1', dto as any, 'user-1', 2);

      const updateCall = documentRepo.update.mock.calls[0][1] as Partial<Document>;
      expect(updateCall.archivedAt).toBeInstanceOf(Date);
      expect(updateCall.archivedById).toBe('user-1');
      expect(updateCall.retentionReviewDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(result.status).toBe(DocumentStatus.ARCHIVED);
    });

    it('should throw BadRequestException for invalid state machine transition', async () => {
      const doc = makeDocument({ status: DocumentStatus.ARCHIVED });
      documentRepo.findOne.mockResolvedValue(doc);

      await expect(
        service.transitionStatus(
          'doc-1',
          { targetStatus: DocumentStatus.DRAFT } as any,
          'user-1',
          2,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw ForbiddenException when user lacks clearance', async () => {
      const doc = makeDocument({ classification: 3 });
      documentRepo.findOne.mockResolvedValue(doc);

      await expect(
        service.transitionStatus(
          'doc-1',
          { targetStatus: DocumentStatus.CANCELLED } as any,
          'user-1',
          1,
        ),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  // ─── addAttachment ──────────────────────────────────────────────────────────

  describe('addAttachment', () => {
    it('should save attachment and emit audit event on happy path', async () => {
      const doc = makeDocument({ classification: 1 });
      documentRepo.findOne.mockResolvedValue(doc);
      const attachment = makeAttachment();
      attachmentRepo.save.mockResolvedValue(attachment);

      const dto = {
        fileId: 'file-uuid-1',
        filename: 'report.pdf',
        mimeType: 'application/pdf',
        fileSizeBytes: 102400,
        role: AttachmentRole.PRIMARY_BODY,
      };

      const result = await service.addAttachment('doc-1', dto as any, 'user-1', 2);

      expect(attachmentRepo.save).toHaveBeenCalled();
      expect(auditService.emit).toHaveBeenCalledWith(
        expect.objectContaining({ eventType: 'edms.attachment.added' }),
      );
      expect(result).toBe(attachment);
    });

    it('should throw ForbiddenException when attachment classification exceeds user clearance', async () => {
      const doc = makeDocument({ classification: 1 });
      documentRepo.findOne.mockResolvedValue(doc);

      const dto = {
        fileId: 'file-uuid-1',
        filename: 'secret.pdf',
        role: AttachmentRole.SUPPORTING,
        classification: 3,       // higher than user clearance of 2
      };

      await expect(
        service.addAttachment('doc-1', dto as any, 'user-1', 2),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw NotFoundException when document does not exist', async () => {
      documentRepo.findOne.mockResolvedValue(null);

      await expect(
        service.addAttachment('no-doc', {} as any, 'user-1', 2),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ─── removeAttachment ───────────────────────────────────────────────────────

  describe('removeAttachment', () => {
    it('should soft-delete attachment by setting removedAt', async () => {
      const doc = makeDocument({ classification: 1 });
      documentRepo.findOne.mockResolvedValue(doc);
      const attachment = makeAttachment({ removedAt: null });
      attachmentRepo.findOne.mockResolvedValue(attachment);
      attachmentRepo.update.mockResolvedValue(undefined);

      await service.removeAttachment('doc-1', 'att-1', 'user-1', 2);

      expect(attachmentRepo.update).toHaveBeenCalledWith(
        'att-1',
        expect.objectContaining({ removedAt: expect.any(Date) }),
      );
      expect(auditService.emit).toHaveBeenCalledWith(
        expect.objectContaining({ eventType: 'edms.attachment.removed' }),
      );
    });

    it('should throw NotFoundException when attachment does not exist or already removed', async () => {
      const doc = makeDocument({ classification: 1 });
      documentRepo.findOne.mockResolvedValue(doc);
      attachmentRepo.findOne.mockResolvedValue(null);

      await expect(
        service.removeAttachment('doc-1', 'no-att', 'user-1', 2),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException when user lacks clearance for the document', async () => {
      const doc = makeDocument({ classification: 3 });
      documentRepo.findOne.mockResolvedValue(doc);

      await expect(
        service.removeAttachment('doc-1', 'att-1', 'user-1', 1),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  // ─── getVersions ────────────────────────────────────────────────────────────

  describe('getVersions', () => {
    it('should return versions ordered by versionNumber DESC', async () => {
      const doc = makeDocument({ classification: 1 });
      documentRepo.findOne.mockResolvedValue(doc);
      const versions = [makeVersion({ versionNumber: 2 }), makeVersion({ versionNumber: 1 })];
      versionRepo.find.mockResolvedValue(versions);

      const result = await service.getVersions('doc-1', 2);

      expect(versionRepo.find).toHaveBeenCalledWith({
        where: { documentId: 'doc-1' },
        order: { versionNumber: 'DESC' },
      });
      expect(result).toBe(versions);
    });

    it('should throw NotFoundException when document does not exist', async () => {
      documentRepo.findOne.mockResolvedValue(null);

      await expect(service.getVersions('no-doc', 2)).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException when user lacks clearance', async () => {
      const doc = makeDocument({ classification: 3 });
      documentRepo.findOne.mockResolvedValue(doc);

      await expect(service.getVersions('doc-1', 1)).rejects.toThrow(ForbiddenException);
    });
  });

  // ─── listArchivedDocuments ───────────────────────────────────────────────────

  describe('listArchivedDocuments', () => {
    it('should return archived documents filtered by clearance', async () => {
      const docs = [makeDocument({ status: DocumentStatus.ARCHIVED })];
      const qb = mockQueryBuilder();
      qb.getManyAndCount.mockResolvedValue([docs, 1]);
      documentRepo.createQueryBuilder.mockReturnValue(qb);

      const result = await service.listArchivedDocuments({ userClearance: 2 });

      expect(qb.where).toHaveBeenCalledWith("doc.status = 'archived'");
      expect(qb.andWhere).toHaveBeenCalledWith('doc.classification <= :clearance', {
        clearance: 2,
      });
      expect(result).toEqual({ items: docs, total: 1 });
    });

    it('should apply search filter when provided', async () => {
      const qb = mockQueryBuilder();
      qb.getManyAndCount.mockResolvedValue([[], 0]);
      documentRepo.createQueryBuilder.mockReturnValue(qb);

      await service.listArchivedDocuments({ userClearance: 2, search: 'budget' });

      expect(qb.andWhere).toHaveBeenCalledWith('doc.subject ILIKE :search', {
        search: '%budget%',
      });
    });

    it('should apply reviewBefore filter when provided', async () => {
      const qb = mockQueryBuilder();
      qb.getManyAndCount.mockResolvedValue([[], 0]);
      documentRepo.createQueryBuilder.mockReturnValue(qb);

      const reviewBefore = new Date('2026-12-31');
      await service.listArchivedDocuments({ userClearance: 2, reviewBefore });

      expect(qb.andWhere).toHaveBeenCalledWith(
        'doc.retention_review_date <= :reviewBefore',
        expect.objectContaining({ reviewBefore: '2026-12-31' }),
      );
    });
  });

  // ─── autoArchiveCompletedDocuments ──────────────────────────────────────────

  describe('autoArchiveCompletedDocuments', () => {
    it('should archive all completed documents older than threshold and return count', async () => {
      const docs = [
        makeDocument({ id: 'doc-a', status: DocumentStatus.COMPLETED, type: makeDocType({ retentionYears: 7 }) }),
        makeDocument({ id: 'doc-b', status: DocumentStatus.COMPLETED, type: makeDocType({ retentionYears: 5 }) }),
      ];
      const qb = mockQueryBuilder();
      qb.getMany.mockResolvedValue(docs);
      documentRepo.createQueryBuilder.mockReturnValue(qb);
      documentRepo.update.mockResolvedValue(undefined);

      const count = await service.autoArchiveCompletedDocuments(90);

      expect(count).toBe(2);
      expect(documentRepo.update).toHaveBeenCalledTimes(2);
      expect(documentRepo.update).toHaveBeenCalledWith(
        'doc-a',
        expect.objectContaining({
          status: DocumentStatus.ARCHIVED,
          archivedById: 'system',
          archivedAt: expect.any(Date),
          retentionReviewDate: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
        }),
      );
      expect(auditService.emit).toHaveBeenCalledTimes(2);
      expect(auditService.emit).toHaveBeenCalledWith(
        expect.objectContaining({ eventType: 'edms.document.auto_archived', actorId: 'system' }),
      );
    });

    it('should return 0 and skip updates when no documents qualify', async () => {
      const qb = mockQueryBuilder();
      qb.getMany.mockResolvedValue([]);
      documentRepo.createQueryBuilder.mockReturnValue(qb);

      const count = await service.autoArchiveCompletedDocuments(90);

      expect(count).toBe(0);
      expect(documentRepo.update).not.toHaveBeenCalled();
      expect(auditService.emit).not.toHaveBeenCalled();
    });

    it('should use default retentionYears of 5 when type is missing', async () => {
      const doc = makeDocument({ id: 'doc-c', status: DocumentStatus.COMPLETED, type: undefined as any });
      const qb = mockQueryBuilder();
      qb.getMany.mockResolvedValue([doc]);
      documentRepo.createQueryBuilder.mockReturnValue(qb);
      documentRepo.update.mockResolvedValue(undefined);

      await service.autoArchiveCompletedDocuments(30);

      const updatePayload = documentRepo.update.mock.calls[0][1] as Partial<Document>;
      const archivedYear = updatePayload.archivedAt!.getFullYear();
      const reviewYear = parseInt(updatePayload.retentionReviewDate!.split('-')[0], 10);
      expect(reviewYear - archivedYear).toBe(5);
    });
  });
});
