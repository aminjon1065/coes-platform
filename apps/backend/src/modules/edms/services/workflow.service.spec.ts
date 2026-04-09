import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ForbiddenException, NotFoundException } from '@nestjs/common';

import { WorkflowService } from './workflow.service';
import { Document, DocumentStatus, DocumentDirection } from '../entities/document.entity';
import { WorkflowTemplate } from '../entities/workflow-template.entity';
import { WorkflowStepDefinition } from '../entities/workflow-step-definition.entity';
import { WorkflowInstance, WorkflowInstanceStatus } from '../entities/workflow-instance.entity';
import { WorkflowStep, WorkflowStepStatus } from '../entities/workflow-step.entity';
import { WorkflowHistory } from '../entities/workflow-history.entity';
import { AuditService } from '../../audit/services/audit.service';
import { OrgService } from '../../org/services/org.service';
import { UsersService } from '../../users/services/users.service';

function mockRepo() {
  return {
    findOne: jest.fn().mockResolvedValue(null),
    find: jest.fn().mockResolvedValue([]),
    save: jest.fn().mockImplementation(async (entity: any) => entity),
    create: jest.fn((dto: any) => dto),
    update: jest.fn().mockResolvedValue({ affected: 1 }),
    count: jest.fn().mockResolvedValue(0),
    createQueryBuilder: jest.fn().mockReturnValue({
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      getOne: jest.fn().mockResolvedValue(null),
      getMany: jest.fn().mockResolvedValue([]),
    }),
  };
}

function makeDocument(overrides: Partial<Document> = {}): Document {
  return {
    id: 'doc-1',
    typeId: 'type-1',
    type: null as any,
    status: DocumentStatus.IN_WORKFLOW,
    direction: DocumentDirection.INTERNAL,
    subject: 'Operational memo',
    registrationNumber: null,
    registeredAt: null,
    documentDate: null,
    classification: 2,
    senderPositionId: null,
    senderName: null,
    externalRefNumber: null,
    recipients: [],
    body: null,
    deadline: null,
    relatedDocumentId: null,
    createdById: 'user-1',
    createdByPositionId: 'pos-1',
    cancelledAt: null,
    cancelReason: null,
    archivedAt: null,
    archivedById: null,
    retentionReviewDate: null,
    versions: [],
    attachments: [],
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as Document;
}

function makeInstance(overrides: Partial<WorkflowInstance> = {}): WorkflowInstance {
  return {
    id: 'wf-1',
    documentId: 'doc-1',
    templateId: 'tpl-1',
    templateVersion: 1,
    status: WorkflowInstanceStatus.ACTIVE,
    currentStepOrder: 1,
    initiatedById: 'user-1',
    initiatedByPositionId: 'pos-1',
    completedAt: null,
    rejectedAt: null,
    rejectionReason: null,
    template: { id: 'tpl-1', steps: [] } as any,
    steps: [],
    ...overrides,
  } as WorkflowInstance;
}

describe('WorkflowService', () => {
  let service: WorkflowService;
  let documentRepo: ReturnType<typeof mockRepo>;
  let instanceRepo: ReturnType<typeof mockRepo>;
  let historyRepo: ReturnType<typeof mockRepo>;
  let stepRepo: ReturnType<typeof mockRepo>;

  beforeEach(async () => {
    documentRepo = mockRepo();
    instanceRepo = mockRepo();
    historyRepo = mockRepo();
    stepRepo = mockRepo();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WorkflowService,
        { provide: getRepositoryToken(Document), useValue: documentRepo },
        { provide: getRepositoryToken(WorkflowTemplate), useValue: mockRepo() },
        { provide: getRepositoryToken(WorkflowStepDefinition), useValue: mockRepo() },
        { provide: getRepositoryToken(WorkflowInstance), useValue: instanceRepo },
        { provide: getRepositoryToken(WorkflowStep), useValue: stepRepo },
        { provide: getRepositoryToken(WorkflowHistory), useValue: historyRepo },
        { provide: AuditService, useValue: { emit: jest.fn().mockResolvedValue(undefined) } },
        {
          provide: OrgService,
          useValue: {
            isSubordinateTo: jest.fn().mockResolvedValue(false),
            getCommandChain: jest.fn().mockResolvedValue([]),
            getPositionsByDepartment: jest.fn().mockResolvedValue([]),
          },
        },
        {
          provide: UsersService,
          useValue: {
            getPositionOccupant: jest.fn().mockResolvedValue(null),
          },
        },
        { provide: EventEmitter2, useValue: { emit: jest.fn() } },
      ],
    }).compile();

    service = module.get(WorkflowService);
  });

  describe('getInstance', () => {
    it('throws ForbiddenException when actor clearance is below document classification', async () => {
      documentRepo.findOne.mockResolvedValue(makeDocument({ classification: 3 }));

      await expect(service.getInstance('doc-1', 2)).rejects.toThrow(ForbiddenException);
    });

    it('returns active workflow instance when clearance is sufficient', async () => {
      const instance = makeInstance();
      documentRepo.findOne.mockResolvedValue(makeDocument({ classification: 2 }));
      instanceRepo.findOne.mockResolvedValue(instance);

      const result = await service.getInstance('doc-1', 2);

      expect(result).toBe(instance);
    });
  });

  describe('getInstanceHistory', () => {
    it('throws ForbiddenException when actor clearance is below document classification', async () => {
      documentRepo.findOne.mockResolvedValue(makeDocument({ classification: 3 }));

      await expect(service.getInstanceHistory('doc-1', 2)).rejects.toThrow(ForbiddenException);
    });
  });

  describe('resumeWorkflow', () => {
    it('throws ForbiddenException when actor is not the document author', async () => {
      instanceRepo.findOne.mockResolvedValue(
        makeInstance({
          status: WorkflowInstanceStatus.SUSPENDED,
          template: { id: 'tpl-1', steps: [] } as any,
        }),
      );
      documentRepo.findOne.mockResolvedValue(makeDocument({ createdById: 'user-9', classification: 1 }));
      stepRepo.findOne.mockResolvedValue(null);

      await expect(service.resumeWorkflow('doc-1', 'user-1', 'pos-1', 1)).rejects.toThrow(ForbiddenException);
    });

    it('throws NotFoundException when suspended workflow does not exist', async () => {
      instanceRepo.findOne.mockResolvedValue(null);

      await expect(service.resumeWorkflow('doc-1', 'user-1', 'pos-1', 1)).rejects.toThrow(NotFoundException);
    });
  });
});
