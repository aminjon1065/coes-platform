import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';

import { ResolutionService } from './resolution.service';
import { Document, DocumentDirection, DocumentStatus } from '../entities/document.entity';
import { Resolution, ResolutionPriority } from '../entities/resolution.entity';
import {
  ExecutorAssignment,
  ExecutorAssignmentStatus,
  ExecutorRole,
} from '../entities/executor-assignment.entity';
import { WorkflowHistory } from '../entities/workflow-history.entity';
import { WorkflowStep } from '../entities/workflow-step.entity';
import { DeadlineExtensionRequest } from '../entities/deadline-extension-request.entity';
import { AuditService } from '../../audit/services/audit.service';
import { OrgService } from '../../org/services/org.service';
import { UsersService } from '../../users/services/users.service';
import { OutboxService } from '../../outbox/services/outbox.service';

function mockRepo() {
  return {
    findOne: jest.fn().mockResolvedValue(null),
    find: jest.fn().mockResolvedValue([]),
    save: jest.fn().mockImplementation(async (entity: any) => entity),
    create: jest.fn((dto: any) => dto),
    update: jest.fn().mockResolvedValue({ affected: 1 }),
  };
}

function makeDocument(overrides: Partial<Document> = {}): Document {
  return {
    id: 'doc-1',
    typeId: 'type-1',
    type: null as any,
    status: DocumentStatus.IN_WORKFLOW,
    direction: DocumentDirection.INTERNAL,
    subject: 'Execution order',
    registrationNumber: null,
    registeredAt: null,
    documentDate: null,
    classification: 2,
    senderPositionId: 'pos-2',
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

function makeResolution(overrides: Partial<Resolution> = {}): Resolution {
  return {
    id: 'res-1',
    documentId: 'doc-1',
    workflowStepId: null,
    issuingPositionId: 'pos-2',
    issuingUserId: 'user-2',
    text: 'Execute immediately',
    priority: ResolutionPriority.ROUTINE,
    deadline: null,
    executorAssignments: [],
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as Resolution;
}

function makeAssignment(overrides: Partial<ExecutorAssignment> = {}): ExecutorAssignment {
  return {
    id: 'assign-1',
    resolutionId: 'res-1',
    resolution: null as any,
    documentId: 'doc-1',
    positionId: 'pos-3',
    assignedUserId: 'user-3',
    executorRole: ExecutorRole.PRIMARY,
    instruction: 'Prepare report',
    status: ExecutorAssignmentStatus.ASSIGNED,
    deadline: null,
    linkedTaskId: null,
    completionReport: null,
    completedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as ExecutorAssignment;
}

describe('ResolutionService', () => {
  let service: ResolutionService;
  let documentRepo: ReturnType<typeof mockRepo>;
  let resolutionRepo: ReturnType<typeof mockRepo>;
  let assignmentRepo: ReturnType<typeof mockRepo>;
  let orgService: { isSubordinateTo: jest.Mock };

  beforeEach(async () => {
    documentRepo = mockRepo();
    resolutionRepo = mockRepo();
    assignmentRepo = mockRepo();
    orgService = { isSubordinateTo: jest.fn().mockResolvedValue(false) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ResolutionService,
        { provide: getRepositoryToken(Document), useValue: documentRepo },
        { provide: getRepositoryToken(Resolution), useValue: resolutionRepo },
        { provide: getRepositoryToken(ExecutorAssignment), useValue: assignmentRepo },
        { provide: getRepositoryToken(DeadlineExtensionRequest), useValue: mockRepo() },
        { provide: getRepositoryToken(WorkflowHistory), useValue: mockRepo() },
        { provide: getRepositoryToken(WorkflowStep), useValue: mockRepo() },
        { provide: AuditService, useValue: { emit: jest.fn().mockResolvedValue(undefined) } },
        { provide: OrgService, useValue: orgService },
        { provide: UsersService, useValue: { getPositionOccupant: jest.fn().mockResolvedValue(null) } },
        { provide: EventEmitter2, useValue: { emit: jest.fn() } },
        { provide: OutboxService, useValue: { publish: jest.fn().mockResolvedValue(undefined) } },
      ],
    }).compile();

    service = module.get(ResolutionService);
  });

  describe('issueResolution', () => {
    it('throws ForbiddenException when actor cannot see the document', async () => {
      documentRepo.findOne.mockResolvedValue(
        makeDocument({
          createdById: 'user-9',
          createdByPositionId: 'pos-9',
          senderPositionId: 'pos-8',
          recipients: [],
        }),
      );
      orgService.isSubordinateTo.mockResolvedValue(true);

      await expect(
        service.issueResolution(
          'doc-1',
          {
            text: 'Do it',
            executors: [{ positionId: 'pos-4' }],
          } as any,
          'user-1',
          'pos-1',
          2,
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('allows visible sender position to issue a resolution', async () => {
      const resolution = makeResolution();
      documentRepo.findOne
        .mockResolvedValueOnce(
          makeDocument({
            createdById: 'user-9',
            createdByPositionId: 'pos-9',
            senderPositionId: 'pos-1',
          }),
        )
        .mockResolvedValueOnce(null);
      resolutionRepo.findOne.mockResolvedValue(resolution);
      resolutionRepo.save.mockResolvedValue(resolution);
      assignmentRepo.save.mockResolvedValue(makeAssignment({ positionId: 'pos-4' }));
      orgService.isSubordinateTo.mockResolvedValue(true);

      const result = await service.issueResolution(
        'doc-1',
        {
          text: 'Do it',
          executors: [{ positionId: 'pos-4' }],
        } as any,
        'user-1',
        'pos-1',
        2,
      );

      expect(result).toBe(resolution);
    });
  });

  describe('getResolutions', () => {
    it('allows recipient position to read resolutions', async () => {
      const resolutions = [makeResolution()];
      documentRepo.findOne.mockResolvedValue(
        makeDocument({
          createdById: 'user-9',
          createdByPositionId: 'pos-9',
          recipients: [{ positionId: 'pos-1', name: 'Recipient', type: 'internal' }],
        }),
      );
      resolutionRepo.find.mockResolvedValue(resolutions);

      const result = await service.getResolutions('doc-1', 'user-1', 'pos-1', 2);

      expect(result).toBe(resolutions);
    });

    it('allows assigned executor position to read resolutions', async () => {
      const resolutions = [makeResolution()];
      documentRepo.findOne.mockResolvedValue(
        makeDocument({
          createdById: 'user-9',
          createdByPositionId: 'pos-9',
          senderPositionId: 'pos-8',
          recipients: [],
        }),
      );
      assignmentRepo.findOne.mockResolvedValue(makeAssignment({ positionId: 'pos-1' }));
      resolutionRepo.find.mockResolvedValue(resolutions);

      const result = await service.getResolutions('doc-1', 'user-1', 'pos-1', 2);

      expect(result).toBe(resolutions);
    });

    it('throws ForbiddenException for outsider with same clearance', async () => {
      documentRepo.findOne.mockResolvedValue(
        makeDocument({
          createdById: 'user-9',
          createdByPositionId: 'pos-9',
          senderPositionId: 'pos-8',
          recipients: [],
        }),
      );
      assignmentRepo.findOne.mockResolvedValue(null);

      await expect(service.getResolutions('doc-1', 'user-1', 'pos-1', 2)).rejects.toThrow(ForbiddenException);
    });
  });

  describe('getExecutorAssignments', () => {
    it('allows assigned executor position to read assignments', async () => {
      const assignments = [makeAssignment({ positionId: 'pos-1' })];
      documentRepo.findOne.mockResolvedValue(
        makeDocument({
          createdById: 'user-9',
          createdByPositionId: 'pos-9',
          senderPositionId: 'pos-8',
          recipients: [],
        }),
      );
      assignmentRepo.findOne.mockResolvedValue(assignments[0]);
      assignmentRepo.find.mockResolvedValue(assignments);

      const result = await service.getExecutorAssignments('doc-1', 'user-1', 'pos-1', 2);

      expect(result).toBe(assignments);
    });

    it('throws NotFoundException when document does not exist', async () => {
      documentRepo.findOne.mockResolvedValue(null);

      await expect(
        service.getExecutorAssignments('doc-1', 'user-1', 'pos-1', 2),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws ForbiddenException when clearance is insufficient', async () => {
      documentRepo.findOne.mockResolvedValue(makeDocument({ classification: 3 }));

      await expect(
        service.getExecutorAssignments('doc-1', 'user-1', 'pos-1', 2),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('fileCompletionReport', () => {
    it('throws BadRequestException when assignment is returned', async () => {
      assignmentRepo.findOne.mockResolvedValue(
        makeAssignment({ positionId: 'pos-1', status: ExecutorAssignmentStatus.RETURNED }),
      );

      await expect(
        service.fileCompletionReport('assign-1', 'done', 'user-1', 'pos-1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException when document is cancelled', async () => {
      assignmentRepo.findOne.mockResolvedValue(
        makeAssignment({ positionId: 'pos-1', status: ExecutorAssignmentStatus.IN_PROGRESS }),
      );
      documentRepo.findOne.mockResolvedValue(
        makeDocument({ id: 'doc-1', status: DocumentStatus.CANCELLED }),
      );

      await expect(
        service.fileCompletionReport('assign-1', 'done', 'user-1', 'pos-1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('completes assignment when status and document state are valid', async () => {
      const assignment = makeAssignment({
        positionId: 'pos-1',
        status: ExecutorAssignmentStatus.IN_PROGRESS,
      });
      assignmentRepo.findOne.mockResolvedValue(assignment);
      documentRepo.findOne.mockResolvedValue(makeDocument({ id: 'doc-1', status: DocumentStatus.IN_WORKFLOW }));
      assignmentRepo.save.mockResolvedValue(assignment);
      assignmentRepo.find.mockResolvedValue([
        { ...assignment, status: ExecutorAssignmentStatus.COMPLETED },
      ]);

      const result = await service.fileCompletionReport('assign-1', 'done', 'user-1', 'pos-1');

      expect(result.status).toBe(ExecutorAssignmentStatus.COMPLETED);
      expect(assignmentRepo.save).toHaveBeenCalled();
    });

    it('emits all_assignments_complete when remaining primary assignments are completed and others are cancelled', async () => {
      const assignment = makeAssignment({
        positionId: 'pos-1',
        status: ExecutorAssignmentStatus.IN_PROGRESS,
      });
      assignmentRepo.findOne.mockResolvedValue(assignment);
      documentRepo.findOne.mockResolvedValue(makeDocument({ id: 'doc-1', status: DocumentStatus.IN_WORKFLOW }));
      assignmentRepo.save.mockResolvedValue(assignment);
      assignmentRepo.find.mockResolvedValue([
        { ...assignment, status: ExecutorAssignmentStatus.COMPLETED },
        makeAssignment({
          id: 'assign-2',
          positionId: 'pos-2',
          status: ExecutorAssignmentStatus.CANCELLED,
        }),
      ]);

      await service.fileCompletionReport('assign-1', 'done', 'user-1', 'pos-1');

      const eventEmitter = (service as any).eventEmitter;
      expect(eventEmitter.emit).toHaveBeenCalledWith('edms.all_assignments_complete', { documentId: 'doc-1' });
    });

    it('does not emit all_assignments_complete when another primary assignment is returned', async () => {
      const assignment = makeAssignment({
        positionId: 'pos-1',
        status: ExecutorAssignmentStatus.IN_PROGRESS,
      });
      assignmentRepo.findOne.mockResolvedValue(assignment);
      documentRepo.findOne.mockResolvedValue(makeDocument({ id: 'doc-1', status: DocumentStatus.IN_WORKFLOW }));
      assignmentRepo.save.mockResolvedValue(assignment);
      assignmentRepo.find.mockResolvedValue([
        { ...assignment, status: ExecutorAssignmentStatus.COMPLETED },
        makeAssignment({
          id: 'assign-2',
          positionId: 'pos-2',
          status: ExecutorAssignmentStatus.RETURNED,
        }),
      ]);

      await service.fileCompletionReport('assign-1', 'done', 'user-1', 'pos-1');

      const eventEmitter = (service as any).eventEmitter;
      expect(eventEmitter.emit).not.toHaveBeenCalledWith('edms.all_assignments_complete', { documentId: 'doc-1' });
    });
  });

  describe('linkTask', () => {
    it('throws NotFoundException when assignment does not exist', async () => {
      assignmentRepo.findOne.mockResolvedValue(null);

      await expect(service.linkTask('assign-1', 'task-1')).rejects.toThrow(NotFoundException);
    });

    it('is idempotent when the same taskId is linked again', async () => {
      assignmentRepo.findOne.mockResolvedValue(
        makeAssignment({ id: 'assign-1', linkedTaskId: 'task-1' }),
      );

      await expect(service.linkTask('assign-1', 'task-1')).resolves.toBeUndefined();
      expect(assignmentRepo.update).not.toHaveBeenCalled();
    });

    it('throws BadRequestException when trying to relink to a different taskId', async () => {
      assignmentRepo.findOne.mockResolvedValue(
        makeAssignment({ id: 'assign-1', linkedTaskId: 'task-1' }),
      );

      await expect(service.linkTask('assign-1', 'task-2')).rejects.toThrow(BadRequestException);
    });
  });
});
