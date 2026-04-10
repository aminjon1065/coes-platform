import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';

import { EdmsTaskSyncListener } from './edms-task-sync.listener';
import { ResolutionService } from '../services/resolution.service';
import {
  ExecutorAssignment,
  ExecutorAssignmentStatus,
  ExecutorRole,
} from '../entities/executor-assignment.entity';
import { Document, DocumentDirection, DocumentStatus } from '../entities/document.entity';

function makeRepo() {
  return {
    findOne: jest.fn().mockResolvedValue(null),
    find: jest.fn().mockResolvedValue([]),
    save: jest.fn().mockImplementation(async (entity: any) => entity),
    update: jest.fn().mockResolvedValue({ affected: 1 }),
  };
}

function makeAssignment(overrides: Partial<ExecutorAssignment> = {}): ExecutorAssignment {
  return {
    id: 'assign-1',
    resolutionId: 'res-1',
    resolution: null as any,
    documentId: 'doc-1',
    positionId: 'pos-1',
    assignedUserId: 'user-1',
    executorRole: ExecutorRole.PRIMARY,
    instruction: null,
    status: ExecutorAssignmentStatus.ASSIGNED,
    deadline: null,
    linkedTaskId: 'task-1',
    completionReport: null,
    completedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as ExecutorAssignment;
}

function makeDocument(overrides: Partial<Document> = {}): Document {
  return {
    id: 'doc-1',
    typeId: 'type-1',
    type: null as any,
    status: DocumentStatus.IN_WORKFLOW,
    direction: DocumentDirection.INTERNAL,
    subject: 'Document',
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

describe('EdmsTaskSyncListener', () => {
  let listener: EdmsTaskSyncListener;
  let assignmentRepo: ReturnType<typeof makeRepo>;
  let documentRepo: ReturnType<typeof makeRepo>;

  beforeEach(async () => {
    assignmentRepo = makeRepo();
    documentRepo = makeRepo();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EdmsTaskSyncListener,
        { provide: ResolutionService, useValue: { linkTask: jest.fn().mockResolvedValue(undefined) } },
        { provide: getRepositoryToken(ExecutorAssignment), useValue: assignmentRepo },
        { provide: getRepositoryToken(Document), useValue: documentRepo },
      ],
    }).compile();

    listener = module.get(EdmsTaskSyncListener);
  });

  describe('onDocumentTaskCompleted', () => {
    it('does not change assignment when the document is already cancelled', async () => {
      assignmentRepo.findOne.mockResolvedValue(
        makeAssignment({ linkedTaskId: 'task-1', status: ExecutorAssignmentStatus.IN_PROGRESS }),
      );
      documentRepo.findOne.mockResolvedValue(
        makeDocument({ id: 'doc-1', status: DocumentStatus.CANCELLED }),
      );

      await listener.onDocumentTaskCompleted({
        taskId: 'task-1',
        sourceDocumentId: 'doc-1',
        sourceResolutionId: 'res-1',
        responsiblePositionId: 'pos-1',
        completionReport: 'done',
        actorId: 'user-1',
      });

      expect(assignmentRepo.save).not.toHaveBeenCalled();
      expect(documentRepo.update).not.toHaveBeenCalled();
    });

    it('does not overwrite a cancelled assignment back to completed', async () => {
      assignmentRepo.findOne.mockResolvedValue(
        makeAssignment({ linkedTaskId: 'task-1', status: ExecutorAssignmentStatus.CANCELLED }),
      );

      await listener.onDocumentTaskCompleted({
        taskId: 'task-1',
        sourceDocumentId: 'doc-1',
        sourceResolutionId: 'res-1',
        responsiblePositionId: 'pos-1',
        completionReport: 'done',
        actorId: 'user-1',
      });

      expect(assignmentRepo.save).not.toHaveBeenCalled();
      expect(documentRepo.update).not.toHaveBeenCalled();
    });

    it('auto-completes document when remaining primary assignments are completed and others are cancelled', async () => {
      assignmentRepo.findOne.mockResolvedValue(
        makeAssignment({ linkedTaskId: 'task-1', status: ExecutorAssignmentStatus.IN_PROGRESS }),
      );
      assignmentRepo.find.mockResolvedValue([
        makeAssignment({ id: 'assign-1', status: ExecutorAssignmentStatus.COMPLETED }),
        makeAssignment({
          id: 'assign-2',
          linkedTaskId: 'task-2',
          positionId: 'pos-2',
          status: ExecutorAssignmentStatus.CANCELLED,
        }),
      ]);
      documentRepo.findOne.mockResolvedValue(makeDocument({ id: 'doc-1', status: DocumentStatus.IN_WORKFLOW }));

      await listener.onDocumentTaskCompleted({
        taskId: 'task-1',
        sourceDocumentId: 'doc-1',
        sourceResolutionId: 'res-1',
        responsiblePositionId: 'pos-1',
        completionReport: 'done',
        actorId: 'user-1',
      });

      expect(documentRepo.update).toHaveBeenCalledWith('doc-1', {
        status: DocumentStatus.COMPLETED,
      });
    });

    it('does not auto-complete document when another primary assignment is returned', async () => {
      assignmentRepo.findOne.mockResolvedValue(
        makeAssignment({ linkedTaskId: 'task-1', status: ExecutorAssignmentStatus.IN_PROGRESS }),
      );
      assignmentRepo.find.mockResolvedValue([
        makeAssignment({ id: 'assign-1', status: ExecutorAssignmentStatus.COMPLETED }),
        makeAssignment({
          id: 'assign-2',
          linkedTaskId: 'task-2',
          positionId: 'pos-2',
          status: ExecutorAssignmentStatus.RETURNED,
        }),
      ]);
      documentRepo.findOne.mockResolvedValue(makeDocument({ id: 'doc-1', status: DocumentStatus.IN_WORKFLOW }));

      await listener.onDocumentTaskCompleted({
        taskId: 'task-1',
        sourceDocumentId: 'doc-1',
        sourceResolutionId: 'res-1',
        responsiblePositionId: 'pos-1',
        completionReport: 'done',
        actorId: 'user-1',
      });

      expect(documentRepo.update).not.toHaveBeenCalled();
    });
  });
});
