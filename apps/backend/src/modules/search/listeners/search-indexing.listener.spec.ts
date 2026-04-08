import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';

import { SearchIndexingListener } from './search-indexing.listener';
import { SearchIndexService } from '../services/search-index.service';
import { Document, DocumentDirection, DocumentStatus } from '../../edms/entities/document.entity';
import { DocumentType } from '../../edms/entities/document-type.entity';
import { Task, TaskPriority, TaskSource, TaskStatus } from '../../tasks/entities/task.entity';
import { TaskType } from '../../tasks/entities/task-type.entity';
import { InboxService } from '../../inbox/services/inbox.service';

function makeDocument(overrides: Partial<Document> = {}): Document {
  return {
    id: 'doc-1',
    typeId: 'type-1',
    type: {
      id: 'type-1',
      name: 'Incoming Correspondence',
      nameRu: null,
      nameTg: null,
      seriesCode: 'VS',
      defaultClassification: 1,
      requiresResolution: false,
      requiresApproval: false,
      defaultDeadlineDays: null,
      retentionYears: 5,
      active: true,
      createdAt: new Date('2026-01-01T00:00:00Z'),
      updatedAt: new Date('2026-01-01T00:00:00Z'),
    } as DocumentType,
    status: DocumentStatus.REGISTERED,
    direction: DocumentDirection.INCOMING,
    subject: 'Flood response memo',
    registrationNumber: 'VS-0001/2026',
    registeredAt: new Date('2026-01-02T00:00:00Z'),
    documentDate: '2026-01-02',
    classification: 2,
    senderPositionId: null,
    senderName: null,
    externalRefNumber: null,
    recipients: [],
    body: 'Operational guidance',
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
    createdAt: new Date('2026-01-01T10:00:00Z'),
    updatedAt: new Date('2026-01-03T10:00:00Z'),
    ...overrides,
  } as Document;
}

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 'task-1',
    typeId: 'type-1',
    type: {
      id: 'type-1',
      name: 'Operational',
      nameRu: null,
      nameTg: null,
      description: null,
      defaultPriority: 2,
      defaultDeadlineDays: null,
      requiresAcceptance: false,
      requiresVerification: false,
      supportsCoExecutors: true,
      supportsSubtasks: true,
      supportsDraft: true,
      active: true,
      createdAt: new Date('2026-01-01T00:00:00Z'),
      updatedAt: new Date('2026-01-01T00:00:00Z'),
    } as TaskType,
    title: 'Assess river overflow',
    description: 'Check affected zone',
    status: TaskStatus.IN_PROGRESS,
    priority: TaskPriority.HIGH,
    source: TaskSource.MANUAL,
    classification: 1,
    assigningPositionId: 'pos-supervisor',
    createdById: 'user-2',
    responsiblePositionId: 'pos-executor',
    parentTaskId: null,
    parentTask: null,
    subtasks: [],
    depth: 0,
    sourceDocumentId: null,
    sourceResolutionId: null,
    discussionChannelId: null,
    deadline: '2026-01-10',
    isOverdue: false,
    overdueAt: null,
    progressPercent: 50,
    progressNote: null,
    completionReport: null,
    completedAt: null,
    cancelledAt: null,
    cancelReason: null,
    holdReason: null,
    cannotExecuteReason: null,
    assignments: [],
    history: [],
    comments: [],
    attachments: [],
    createdAt: new Date('2026-01-01T10:00:00Z'),
    updatedAt: new Date('2026-01-03T10:00:00Z'),
    ...overrides,
  } as Task;
}

describe('SearchIndexingListener', () => {
  let listener: SearchIndexingListener;
  let documentRepo: { findOne: jest.Mock };
  let taskRepo: { findOne: jest.Mock };
  let indexService: jest.Mocked<SearchIndexService>;
  let inboxService: { executeOnce: jest.Mock };

  beforeEach(async () => {
    documentRepo = { findOne: jest.fn() };
    taskRepo = { findOne: jest.fn() };
    indexService = {
      indexDocument: jest.fn(),
      indexTask: jest.fn(),
      indexMessage: jest.fn(),
      deleteDocument: jest.fn(),
      deleteTask: jest.fn(),
      deleteMessage: jest.fn(),
    } as unknown as jest.Mocked<SearchIndexService>;
    inboxService = {
      executeOnce: jest.fn().mockImplementation(async (_consumer, _eventType, _payload, handler) => {
        await handler();
        return true;
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SearchIndexingListener,
        { provide: getRepositoryToken(Document), useValue: documentRepo },
        { provide: getRepositoryToken(Task), useValue: taskRepo },
        { provide: SearchIndexService, useValue: indexService },
        { provide: InboxService, useValue: inboxService },
      ],
    }).compile();

    listener = module.get(SearchIndexingListener);
  });

  describe('handleDocumentChange', () => {
    it('loads the document and indexes it', async () => {
      documentRepo.findOne.mockResolvedValue(makeDocument());

      await listener.handleDocumentChange({ documentId: 'doc-1' });

      expect(inboxService.executeOnce).toHaveBeenCalled();
      expect(documentRepo.findOne).toHaveBeenCalledWith({ where: { id: 'doc-1' } });
      expect(indexService.indexDocument).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'doc-1',
          subject: 'Flood response memo',
          typeName: 'Incoming Correspondence',
          classification: 2,
        }),
      );
    });

    it('deletes the stale document index when the record is missing', async () => {
      documentRepo.findOne.mockResolvedValue(null);

      await listener.handleDocumentChange({ documentId: 'doc-missing' });

      expect(indexService.deleteDocument).toHaveBeenCalledWith('doc-missing');
      expect(indexService.indexDocument).not.toHaveBeenCalled();
    });
  });

  describe('handleTaskChange', () => {
    it('loads the task and indexes it', async () => {
      taskRepo.findOne.mockResolvedValue(makeTask());

      await listener.handleTaskChange({ taskId: 'task-1' });

      expect(inboxService.executeOnce).toHaveBeenCalled();
      expect(taskRepo.findOne).toHaveBeenCalledWith({ where: { id: 'task-1' } });
      expect(indexService.indexTask).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'task-1',
          title: 'Assess river overflow',
          priority: TaskPriority.HIGH,
          responsiblePositionId: 'pos-executor',
        }),
      );
    });

    it('deletes the stale task index when the record is missing', async () => {
      taskRepo.findOne.mockResolvedValue(null);

      await listener.handleTaskChange({ taskId: 'task-missing' });

      expect(indexService.deleteTask).toHaveBeenCalledWith('task-missing');
      expect(indexService.indexTask).not.toHaveBeenCalled();
    });
  });

  describe('handleMessageCreated', () => {
    it('indexes message through inbox guard', async () => {
      await listener.handleMessageCreated({
        messageId: 'msg-1',
        channelId: 'chan-1',
        body: 'hello',
        senderId: 'user-1',
        senderPositionId: 'pos-1',
        classification: 1,
        sequence: 1,
        createdAt: '2026-01-03T10:00:00Z',
      });

      expect(inboxService.executeOnce).toHaveBeenCalled();
      expect(indexService.indexMessage).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'msg-1', body: 'hello' }),
      );
    });

    it('skips duplicate message payload when inbox reports already processed', async () => {
      inboxService.executeOnce.mockResolvedValue(false);

      await listener.handleMessageCreated({
        messageId: 'msg-1',
        channelId: 'chan-1',
        body: 'hello',
        senderId: 'user-1',
        senderPositionId: 'pos-1',
        classification: 1,
        sequence: 1,
        createdAt: '2026-01-03T10:00:00Z',
      });

      expect(indexService.indexMessage).not.toHaveBeenCalled();
    });
  });
});
