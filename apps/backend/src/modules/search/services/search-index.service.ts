import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Client as OpenSearchClient } from '@opensearch-project/opensearch';

/** Supported index domains */
export enum SearchIndexName {
  DOCUMENTS = 'documents',
  TASKS     = 'tasks',
  MESSAGES  = 'messages',
}

export interface DocumentIndexDoc {
  id: string;
  subject: string;
  body: string | null;
  status: string;
  direction: string;
  typeId: string;
  typeName: string | null;
  registrationNumber: string | null;
  classification: number;
  createdById: string;
  createdAt: string;
  updatedAt: string;
}

export interface TaskIndexDoc {
  id: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  classification: number;
  responsiblePositionId: string;
  createdById: string;
  deadline: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface MessageIndexDoc {
  id: string;
  channelId: string;
  body: string | null;
  senderId: string;
  senderPositionId: string;
  classification: number;
  sequence: number;
  createdAt: string;
}

type IndexDoc = DocumentIndexDoc | TaskIndexDoc | MessageIndexDoc;

@Injectable()
export class SearchIndexService implements OnModuleInit {
  private readonly logger = new Logger(SearchIndexService.name);
  private client: OpenSearchClient;
  private prefix: string;

  constructor(private readonly config: ConfigService) {}

  async onModuleInit(): Promise<void> {
    const node     = this.config.get<string>('opensearch.node', 'http://localhost:9200');
    const username = this.config.get<string>('opensearch.username');
    const password = this.config.get<string>('opensearch.password');
    this.prefix    = this.config.get<string>('opensearch.indexPrefix', 'coescd');

    const clientConfig: ConstructorParameters<typeof OpenSearchClient>[0] = { node };
    if (username && password) {
      clientConfig.auth = { username, password };
    }

    this.client = new OpenSearchClient(clientConfig);
    await this.ensureIndices();
  }

  // ─── Index bootstrap ─────────────────────────────────────────────────────────

  private async ensureIndices(): Promise<void> {
    await Promise.all([
      this.ensureIndex(SearchIndexName.DOCUMENTS, DOCUMENT_MAPPING),
      this.ensureIndex(SearchIndexName.TASKS,     TASK_MAPPING),
      this.ensureIndex(SearchIndexName.MESSAGES,  MESSAGE_MAPPING),
    ]);
  }

  private async ensureIndex(name: SearchIndexName, mapping: object): Promise<void> {
    const idx = this.indexName(name);
    try {
      const exists = await this.client.indices.exists({ index: idx });
      if (!exists.body) {
        await this.client.indices.create({
          index: idx,
          body: {
            settings: {
              number_of_shards: 1,
              number_of_replicas: 0,   // single-node dev; set to 1 in production
              analysis: {
                analyzer: {
                  default: {
                    type: 'standard',
                    stopwords: '_none_',   // don't strip stopwords for government docs
                  },
                },
              },
            },
            mappings: mapping,
          },
        });
        this.logger.log(`Created OpenSearch index: ${idx}`);
      }
    } catch (err) {
      // Non-fatal — search degrades gracefully if OpenSearch is unavailable at startup
      this.logger.error(`Failed to ensure index ${idx}: ${(err as Error).message}`);
    }
  }

  // ─── Indexing operations ──────────────────────────────────────────────────────

  async indexDocument(doc: DocumentIndexDoc): Promise<void> {
    await this.index(SearchIndexName.DOCUMENTS, doc.id, doc);
  }

  async indexTask(task: TaskIndexDoc): Promise<void> {
    await this.index(SearchIndexName.TASKS, task.id, task);
  }

  async indexMessage(msg: MessageIndexDoc): Promise<void> {
    // Only index non-deleted, non-empty messages
    if (!msg.body) return;
    await this.index(SearchIndexName.MESSAGES, msg.id, msg);
  }

  async deleteDocument(id: string): Promise<void> {
    await this.deleteFromIndex(SearchIndexName.DOCUMENTS, id);
  }

  async deleteTask(id: string): Promise<void> {
    await this.deleteFromIndex(SearchIndexName.TASKS, id);
  }

  async deleteMessage(id: string): Promise<void> {
    await this.deleteFromIndex(SearchIndexName.MESSAGES, id);
  }

  // ─── Internal helpers ─────────────────────────────────────────────────────────

  private async index(name: SearchIndexName, id: string, body: IndexDoc): Promise<void> {
    try {
      await this.client.index({
        index: this.indexName(name),
        id,
        body,
        refresh: 'false',  // async refresh — no need to block on every write
      });
    } catch (err) {
      this.logger.error(`Failed to index ${name}/${id}: ${(err as Error).message}`);
    }
  }

  private async deleteFromIndex(name: SearchIndexName, id: string): Promise<void> {
    try {
      await this.client.delete({
        index: this.indexName(name),
        id,
        refresh: 'false',
      });
    } catch (err) {
      // 404 means it was never indexed — that's fine
      if ((err as any)?.statusCode !== 404) {
        this.logger.error(`Failed to delete ${name}/${id}: ${(err as Error).message}`);
      }
    }
  }

  indexName(name: SearchIndexName): string {
    return `${this.prefix}-${name}`;
  }

  /** Expose raw client for query service */
  getClient(): OpenSearchClient {
    return this.client;
  }
}

// ─── Index mappings ───────────────────────────────────────────────────────────

const DOCUMENT_MAPPING = {
  properties: {
    id:                 { type: 'keyword' },
    subject:            { type: 'text', analyzer: 'standard', fields: { keyword: { type: 'keyword' } } },
    body:               { type: 'text', analyzer: 'standard' },
    status:             { type: 'keyword' },
    direction:          { type: 'keyword' },
    typeId:             { type: 'keyword' },
    typeName:           { type: 'text', fields: { keyword: { type: 'keyword' } } },
    registrationNumber: { type: 'keyword' },
    classification:     { type: 'integer' },
    createdById:        { type: 'keyword' },
    createdAt:          { type: 'date' },
    updatedAt:          { type: 'date' },
  },
};

const TASK_MAPPING = {
  properties: {
    id:                    { type: 'keyword' },
    title:                 { type: 'text', analyzer: 'standard', fields: { keyword: { type: 'keyword' } } },
    description:           { type: 'text', analyzer: 'standard' },
    status:                { type: 'keyword' },
    priority:              { type: 'keyword' },
    classification:        { type: 'integer' },
    responsiblePositionId: { type: 'keyword' },
    createdById:           { type: 'keyword' },
    deadline:              { type: 'date', format: 'yyyy-MM-dd' },
    createdAt:             { type: 'date' },
    updatedAt:             { type: 'date' },
  },
};

const MESSAGE_MAPPING = {
  properties: {
    id:               { type: 'keyword' },
    channelId:        { type: 'keyword' },
    body:             { type: 'text', analyzer: 'standard' },
    senderId:         { type: 'keyword' },
    senderPositionId: { type: 'keyword' },
    classification:   { type: 'integer' },
    sequence:         { type: 'integer' },
    createdAt:        { type: 'date' },
  },
};
