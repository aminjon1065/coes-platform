import { Test, TestingModule } from '@nestjs/testing';

import { SearchQueryService, SearchResult } from './search-query.service';
import { SearchIndexService, SearchIndexName } from './search-index.service';

// ─── OpenSearch client mock ───────────────────────────────────────────────────

const mockOsClient = {
  search: jest.fn(),
  index:  jest.fn(),
  delete: jest.fn(),
  ping: jest.fn(),
  indices: {
    exists: jest.fn(),
    create: jest.fn(),
    refresh: jest.fn(),
  },
};

const getClientMock = jest.fn(() => mockOsClient);
const indexNameMock = jest.fn((n: SearchIndexName) => n);

// ─── SearchIndexService mock ──────────────────────────────────────────────────

const mockIndexService = {
  indexDocument:  jest.fn(),
  indexTask:      jest.fn(),
  indexMessage:   jest.fn(),
  deleteDocument: jest.fn(),
  deleteTask:     jest.fn(),
  deleteMessage:  jest.fn(),
  getClient:      getClientMock,
  indexName:      indexNameMock,
} as unknown as jest.Mocked<SearchIndexService>;

// ─── Helper to build a minimal OpenSearch response ────────────────────────────

function buildOsResponse(
  hits: any[] = [],
  total: number | { value: number } = 0,
  took = 5,
) {
  return {
    body: {
      took,
      hits: {
        total: typeof total === 'number' ? { value: total } : total,
        hits,
      },
    },
  };
}

// ─── Suite: SearchQueryService ────────────────────────────────────────────────

describe('SearchQueryService', () => {
  let queryService: SearchQueryService;

  beforeEach(async () => {
    jest.clearAllMocks();
    getClientMock.mockReturnValue(mockOsClient);
    indexNameMock.mockImplementation((n: SearchIndexName) => n);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SearchQueryService,
        { provide: SearchIndexService, useValue: mockIndexService },
      ],
    }).compile();

    queryService = module.get<SearchQueryService>(SearchQueryService);
  });

  // ─── search ────────────────────────────────────────────────────────────────

  describe('search', () => {
    it('returns results mapped to SearchHit shape', async () => {
      const rawHits = [
        {
          _index: SearchIndexName.DOCUMENTS,
          _id: 'doc-1',
          _score: 1.5,
          _source: { subject: 'Flood report', classification: 1 },
          highlight: { subject: ['<mark>Flood</mark> report'] },
        },
      ];
      mockOsClient.search.mockResolvedValue(buildOsResponse(rawHits, 1, 3));

      const result: SearchResult = await queryService.search({
        query: 'flood',
        userClearance: 2,
      });

      expect(result.total).toBe(1);
      expect(result.took).toBe(3);
      expect(result.hits).toHaveLength(1);
      expect(result.hits[0].id).toBe('doc-1');
      expect(result.hits[0].score).toBe(1.5);
      expect(result.hits[0].source).toMatchObject({ subject: 'Flood report' });
    });

    it('passes classification filter <= userClearance in query body', async () => {
      mockOsClient.search.mockResolvedValue(buildOsResponse([], 0));

      await queryService.search({ query: 'test', userClearance: 2 });

      const [callArgs] = mockOsClient.search.mock.calls[0];
      const filter = callArgs.body.query.bool.filter;

      expect(filter).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ range: { classification: { lte: 2 } } }),
        ]),
      );
    });

    it('enforces classification: higher-classified docs excluded by filter value', async () => {
      // Simulates OpenSearch honouring the lte filter — service should pass
      // clearance=1 so only docs classified <=1 come back from the mock
      const rawHits = [
        {
          _index: SearchIndexName.DOCUMENTS,
          _id: 'doc-unclassified',
          _score: 0.9,
          _source: { classification: 1 },
          highlight: null,
        },
      ];
      mockOsClient.search.mockResolvedValue(buildOsResponse(rawHits, 1));

      const result = await queryService.search({ query: 'report', userClearance: 1 });

      const [callArgs] = mockOsClient.search.mock.calls[0];
      const filter = callArgs.body.query.bool.filter;
      // Verify the lte bound matches userClearance = 1
      expect(filter).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ range: { classification: { lte: 1 } } }),
        ]),
      );
      // Only the classification-1 doc is returned
      expect(result.hits).toHaveLength(1);
      expect(result.hits[0].id).toBe('doc-unclassified');
    });

    it('returns empty result set when no hits match', async () => {
      mockOsClient.search.mockResolvedValue(buildOsResponse([], 0));

      const result = await queryService.search({ query: 'nothing', userClearance: 3 });

      expect(result.total).toBe(0);
      expect(result.hits).toHaveLength(0);
    });

    it('handles numeric total format (older OpenSearch response)', async () => {
      mockOsClient.search.mockResolvedValue(
        buildOsResponse([{ _index: 'documents', _id: 'd1', _score: 1, _source: {} }], 1),
      );
      // Override to use plain number total
      mockOsClient.search.mockResolvedValue({
        body: {
          took: 1,
          hits: {
            total: 1,   // plain number, not { value }
            hits: [{ _index: 'documents', _id: 'd1', _score: 1, _source: {} }],
          },
        },
      });

      const result = await queryService.search({ query: 'x', userClearance: 2 });

      expect(result.total).toBe(1);
    });

    it('handles OpenSearch errors gracefully: returns empty result', async () => {
      mockOsClient.search.mockRejectedValue(new Error('connection refused'));

      const result = await queryService.search({ query: 'crash', userClearance: 2 });

      expect(result.total).toBe(0);
      expect(result.hits).toHaveLength(0);
      expect(result.took).toBe(0);
    });

    it('searches across a specific subset of indices when specified', async () => {
      mockOsClient.search.mockResolvedValue(buildOsResponse([], 0));

      await queryService.search({
        query: 'test',
        indices: [SearchIndexName.TASKS],
        userClearance: 2,
      });

      const [callArgs] = mockOsClient.search.mock.calls[0];
      expect(callArgs.index).toBe(SearchIndexName.TASKS);
    });

    it('applies pagination (size / from) from limit and offset params', async () => {
      mockOsClient.search.mockResolvedValue(buildOsResponse([], 0));

      await queryService.search({ query: 'x', userClearance: 2, limit: 5, offset: 10 });

      const [callArgs] = mockOsClient.search.mock.calls[0];
      expect(callArgs.body.size).toBe(5);
      expect(callArgs.body.from).toBe(10);
    });
  });

  // ─── searchMessages ────────────────────────────────────────────────────────

  describe('searchMessages', () => {
    it('scopes search to a specific channelId', async () => {
      mockOsClient.search.mockResolvedValue(buildOsResponse([], 0));

      await queryService.searchMessages({
        query: 'alert',
        channelId: 'chan-1',
        userClearance: 2,
      });

      const [callArgs] = mockOsClient.search.mock.calls[0];
      const filter = callArgs.body.query.bool.filter;

      expect(filter).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ term: { channelId: 'chan-1' } }),
        ]),
      );
    });

    it('enforces classification filter in message search', async () => {
      mockOsClient.search.mockResolvedValue(buildOsResponse([], 0));

      await queryService.searchMessages({
        query: 'flood',
        channelId: 'chan-1',
        userClearance: 1,
      });

      const [callArgs] = mockOsClient.search.mock.calls[0];
      const filter = callArgs.body.query.bool.filter;

      expect(filter).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ range: { classification: { lte: 1 } } }),
        ]),
      );
    });

    it('targets only the messages index', async () => {
      mockOsClient.search.mockResolvedValue(buildOsResponse([], 0));

      await queryService.searchMessages({ query: 'x', channelId: 'c1', userClearance: 2 });

      const [callArgs] = mockOsClient.search.mock.calls[0];
      expect(callArgs.index).toBe(SearchIndexName.MESSAGES);
    });

    it('returns hits mapped correctly for messages', async () => {
      const rawHits = [
        {
          _index: SearchIndexName.MESSAGES,
          _id: 'msg-1',
          _score: 2.0,
          _source: { body: 'Emergency alert', channelId: 'chan-1', classification: 1 },
          highlight: { body: ['Emergency <mark>alert</mark>'] },
        },
      ];
      mockOsClient.search.mockResolvedValue(buildOsResponse(rawHits, 1));

      const result = await queryService.searchMessages({
        query: 'alert', channelId: 'chan-1', userClearance: 2,
      });

      expect(result.hits).toHaveLength(1);
      expect(result.hits[0].index).toBe(SearchIndexName.MESSAGES);
      expect(result.hits[0].id).toBe('msg-1');
    });

    it('handles OpenSearch errors gracefully: returns empty result', async () => {
      mockOsClient.search.mockRejectedValue(new Error('timeout'));

      const result = await queryService.searchMessages({
        query: 'x', channelId: 'c', userClearance: 2,
      });

      expect(result.total).toBe(0);
      expect(result.hits).toHaveLength(0);
    });
  });
});

// ─── Suite: SearchIndexService ────────────────────────────────────────────────

describe('SearchIndexService (indexing operations)', () => {
  let indexService: SearchIndexService;

  // Provide a real SearchIndexService but replace its private client via
  // mocking at the module level — we mock onModuleInit to avoid real network.
  beforeEach(async () => {
    jest.clearAllMocks();

    const { ConfigService } = await import('@nestjs/config');

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SearchIndexService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockImplementation((key: string, def?: any) => def ?? null),
          },
        },
      ],
    }).compile();

    indexService = module.get<SearchIndexService>(SearchIndexService);

    // Bypass real OpenSearch initialisation — inject the mock client directly
    (indexService as any).client = mockOsClient;
    (indexService as any).prefix = 'coescd';
  });

  // ─── indexDocument ─────────────────────────────────────────────────────────

  describe('indexDocument', () => {
    it('calls client.index with documents index and document id', async () => {
      mockOsClient.index.mockResolvedValue({ body: { result: 'created' } });

      const doc = {
        id: 'doc-1',
        subject: 'Test subject',
        body: 'Test body',
        status: 'draft',
        direction: 'incoming',
        typeId: 'type-1',
        typeName: 'Letter',
        registrationNumber: 'REG-001',
        classification: 1,
        createdById: 'user-1',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      await indexService.indexDocument(doc);

      expect(mockOsClient.index).toHaveBeenCalledWith(
        expect.objectContaining({
          index: 'coescd-documents',
          id:    'doc-1',
          body:  doc,
        }),
      );
    });
  });

  // ─── indexTask ─────────────────────────────────────────────────────────────

  describe('indexTask', () => {
    it('calls client.index with tasks index and task id', async () => {
      mockOsClient.index.mockResolvedValue({ body: { result: 'created' } });

      const task = {
        id: 'task-1',
        title: 'Coordinate evacuation',
        description: null,
        status: 'open',
        priority: 'high',
        classification: 2,
        responsiblePositionId: 'pos-1',
        createdById: 'user-1',
        deadline: '2026-06-01',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      await indexService.indexTask(task);

      expect(mockOsClient.index).toHaveBeenCalledWith(
        expect.objectContaining({
          index: 'coescd-tasks',
          id:    'task-1',
          body:  task,
        }),
      );
    });
  });

  // ─── indexMessage ──────────────────────────────────────────────────────────

  describe('indexMessage', () => {
    it('calls client.index with messages index when body is non-empty', async () => {
      mockOsClient.index.mockResolvedValue({ body: { result: 'created' } });

      const msg = {
        id: 'msg-1',
        channelId: 'chan-1',
        body: 'Emergency alert',
        senderId: 'user-1',
        senderPositionId: 'pos-1',
        classification: 1,
        sequence: 42,
        createdAt: new Date().toISOString(),
      };

      await indexService.indexMessage(msg);

      expect(mockOsClient.index).toHaveBeenCalledWith(
        expect.objectContaining({
          index: 'coescd-messages',
          id:    'msg-1',
        }),
      );
    });

    it('skips indexing when message body is null/empty', async () => {
      const msg = {
        id: 'msg-empty',
        channelId: 'chan-1',
        body: null,
        senderId: 'user-1',
        senderPositionId: 'pos-1',
        classification: 1,
        sequence: 1,
        createdAt: new Date().toISOString(),
      };

      await indexService.indexMessage(msg);

      expect(mockOsClient.index).not.toHaveBeenCalled();
    });
  });

  // ─── deleteDocument ────────────────────────────────────────────────────────

  describe('deleteDocument', () => {
    it('calls client.delete with documents index and given id', async () => {
      mockOsClient.delete.mockResolvedValue({ body: { result: 'deleted' } });

      await indexService.deleteDocument('doc-1');

      expect(mockOsClient.delete).toHaveBeenCalledWith(
        expect.objectContaining({
          index: 'coescd-documents',
          id:    'doc-1',
        }),
      );
    });
  });

  // ─── deleteTask ────────────────────────────────────────────────────────────

  describe('deleteTask', () => {
    it('calls client.delete with tasks index and given id', async () => {
      mockOsClient.delete.mockResolvedValue({ body: { result: 'deleted' } });

      await indexService.deleteTask('task-1');

      expect(mockOsClient.delete).toHaveBeenCalledWith(
        expect.objectContaining({
          index: 'coescd-tasks',
          id:    'task-1',
        }),
      );
    });
  });

  // ─── deleteMessage ─────────────────────────────────────────────────────────

  describe('deleteMessage', () => {
    it('calls client.delete with messages index and given id', async () => {
      mockOsClient.delete.mockResolvedValue({ body: { result: 'deleted' } });

      await indexService.deleteMessage('msg-1');

      expect(mockOsClient.delete).toHaveBeenCalledWith(
        expect.objectContaining({
          index: 'coescd-messages',
          id:    'msg-1',
        }),
      );
    });

    it('does not throw when client returns a 404 (message was never indexed)', async () => {
      const err: any = new Error('Not Found');
      err.statusCode = 404;
      mockOsClient.delete.mockRejectedValue(err);

      await expect(indexService.deleteMessage('ghost')).resolves.toBeUndefined();
    });
  });

  // ─── indexName ─────────────────────────────────────────────────────────────

  describe('indexName', () => {
    it('prepends prefix to index name', () => {
      expect(indexService.indexName(SearchIndexName.DOCUMENTS)).toBe('coescd-documents');
      expect(indexService.indexName(SearchIndexName.TASKS)).toBe('coescd-tasks');
      expect(indexService.indexName(SearchIndexName.MESSAGES)).toBe('coescd-messages');
    });
  });

  describe('getHealth', () => {
    it('returns healthy when OpenSearch is reachable and indices exist', async () => {
      mockOsClient.ping.mockResolvedValue({ statusCode: 200 });
      mockOsClient.indices.exists.mockResolvedValue({ body: true });

      const result = await indexService.getHealth();

      expect(result.status).toBe('healthy');
      expect(result.available).toBe(true);
      expect(result.indices).toHaveLength(3);
      expect(mockOsClient.indices.exists).toHaveBeenCalledTimes(3);
    });

    it('returns degraded when ping fails', async () => {
      mockOsClient.ping.mockRejectedValue(new Error('connection refused'));

      const result = await indexService.getHealth();

      expect(result.status).toBe('degraded');
      expect(result.available).toBe(false);
      expect(result.indices.every((entry) => entry.exists === false)).toBe(true);
    });
  });
});
