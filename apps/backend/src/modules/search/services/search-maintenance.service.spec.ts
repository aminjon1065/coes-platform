import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository, ObjectLiteral } from 'typeorm';

import { SearchMaintenanceService } from './search-maintenance.service';
import { SearchIndexName, SearchIndexService } from './search-index.service';
import { Document } from '../../edms/entities/document.entity';
import { Task } from '../../tasks/entities/task.entity';
import { Message } from '../../chat/entities/message.entity';

function mockRepo<T extends ObjectLiteral>() {
  return {
    find: jest.fn(),
  } as unknown as jest.Mocked<Repository<T>>;
}

describe('SearchMaintenanceService', () => {
  let service: SearchMaintenanceService;
  let documentRepo: jest.Mocked<Repository<Document>>;
  let taskRepo: jest.Mocked<Repository<Task>>;
  let messageRepo: jest.Mocked<Repository<Message>>;
  let indexService: {
    ensureIndicesReady: jest.Mock;
    refreshIndices: jest.Mock;
    getHealth: jest.Mock;
    indexDocument: jest.Mock;
    indexTask: jest.Mock;
    indexMessage: jest.Mock;
  };

  beforeEach(async () => {
    documentRepo = mockRepo<Document>();
    taskRepo = mockRepo<Task>();
    messageRepo = mockRepo<Message>();

    indexService = {
      ensureIndicesReady: jest.fn().mockResolvedValue(undefined),
      refreshIndices: jest.fn().mockResolvedValue(undefined),
      getHealth: jest.fn().mockResolvedValue({ status: 'healthy', available: true, indices: [] }),
      indexDocument: jest.fn().mockResolvedValue(undefined),
      indexTask: jest.fn().mockResolvedValue(undefined),
      indexMessage: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SearchMaintenanceService,
        { provide: getRepositoryToken(Document), useValue: documentRepo },
        { provide: getRepositoryToken(Task), useValue: taskRepo },
        { provide: getRepositoryToken(Message), useValue: messageRepo },
        { provide: SearchIndexService, useValue: indexService },
      ],
    }).compile();

    service = module.get<SearchMaintenanceService>(SearchMaintenanceService);
  });

  it('returns OpenSearch health from the index service', async () => {
    const health = await service.getHealth();

    expect(health).toEqual({ status: 'healthy', available: true, indices: [] });
    expect(indexService.getHealth).toHaveBeenCalled();
  });

  it('reindexes selected indices in batches and refreshes at the end', async () => {
    documentRepo.find
      .mockResolvedValueOnce([
        {
          id: 'doc-1',
          subject: 'Flood report',
          body: 'Body',
          status: 'registered',
          direction: 'incoming',
          typeId: 'type-1',
          type: { name: 'Letter' },
          registrationNumber: 'REG-1',
          classification: 1,
          createdById: 'user-1',
          createdAt: new Date('2026-01-01T00:00:00Z'),
          updatedAt: new Date('2026-01-02T00:00:00Z'),
        } as Document,
      ])
      .mockResolvedValueOnce([]);

    taskRepo.find
      .mockResolvedValueOnce([
        {
          id: 'task-1',
          title: 'Inspect bridge',
          description: 'Review sector 4',
          status: 'open',
          priority: 'high',
          classification: 2,
          responsiblePositionId: 'pos-1',
          createdById: 'user-1',
          deadline: '2026-01-10',
          createdAt: new Date('2026-01-01T00:00:00Z'),
          updatedAt: new Date('2026-01-02T00:00:00Z'),
        } as unknown as Task,
      ])
      .mockResolvedValueOnce([]);

    messageRepo.find
      .mockResolvedValueOnce([
        {
          id: 'msg-1',
          channelId: 'chan-1',
          body: 'Emergency alert',
          senderId: 'user-1',
          senderPositionId: 'pos-1',
          classification: 1,
          sequence: 1,
          createdAt: new Date('2026-01-01T00:00:00Z'),
          deletedAt: null,
        } as Message,
        {
          id: 'msg-2',
          channelId: 'chan-1',
          body: null,
          senderId: 'user-1',
          senderPositionId: 'pos-1',
          classification: 1,
          sequence: 2,
          createdAt: new Date('2026-01-01T00:01:00Z'),
          deletedAt: null,
        } as Message,
      ])
      .mockResolvedValueOnce([]);

    const result = await service.reindex({
      batchSize: 100,
      ensureIndices: true,
      refresh: true,
    });

    expect(indexService.ensureIndicesReady).toHaveBeenCalledWith([
      SearchIndexName.DOCUMENTS,
      SearchIndexName.TASKS,
      SearchIndexName.MESSAGES,
    ]);
    expect(indexService.indexDocument).toHaveBeenCalledTimes(1);
    expect(indexService.indexTask).toHaveBeenCalledTimes(1);
    expect(indexService.indexMessage).toHaveBeenCalledTimes(1);
    expect(indexService.refreshIndices).toHaveBeenCalledWith([
      SearchIndexName.DOCUMENTS,
      SearchIndexName.TASKS,
      SearchIndexName.MESSAGES,
    ]);
    expect(result.summary).toMatchObject({
      documents: { scanned: 1, indexed: 1, skipped: 0 },
      tasks: { scanned: 1, indexed: 1, skipped: 0 },
      messages: { scanned: 2, indexed: 1, skipped: 1 },
    });
  });

  it('can reindex only messages without ensuring indices or refresh', async () => {
    messageRepo.find
      .mockResolvedValueOnce([
        {
          id: 'msg-1',
          channelId: 'chan-1',
          body: 'Emergency alert',
          senderId: 'user-1',
          senderPositionId: null,
          classification: 1,
          sequence: 1,
          createdAt: new Date('2026-01-01T00:00:00Z'),
          deletedAt: null,
        } as Message,
      ])
      .mockResolvedValueOnce([]);

    const result = await service.reindex({
      indices: [SearchIndexName.MESSAGES],
      ensureIndices: false,
      refresh: false,
      batchSize: 50,
    });

    expect(indexService.ensureIndicesReady).not.toHaveBeenCalled();
    expect(indexService.indexDocument).not.toHaveBeenCalled();
    expect(indexService.indexTask).not.toHaveBeenCalled();
    expect(indexService.indexMessage).toHaveBeenCalledTimes(1);
    expect(indexService.refreshIndices).not.toHaveBeenCalled();
    expect(result.indices).toEqual([SearchIndexName.MESSAGES]);
  });
});
