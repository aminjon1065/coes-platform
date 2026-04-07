import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';

import { Document } from '../../edms/entities/document.entity';
import { Task } from '../../tasks/entities/task.entity';
import { Message } from '../../chat/entities/message.entity';
import { ReindexSearchDto } from '../dto/reindex-search.dto';
import { SearchIndexName, SearchIndexService } from './search-index.service';

export interface ReindexCounters {
  scanned: number;
  indexed: number;
  skipped: number;
}

export interface SearchReindexResult {
  startedAt: string;
  finishedAt: string;
  batchSize: number;
  indices: SearchIndexName[];
  summary: Partial<Record<SearchIndexName, ReindexCounters>>;
  health: Awaited<ReturnType<SearchIndexService['getHealth']>>;
}

@Injectable()
export class SearchMaintenanceService {
  constructor(
    @InjectRepository(Document)
    private readonly documentRepo: Repository<Document>,
    @InjectRepository(Task)
    private readonly taskRepo: Repository<Task>,
    @InjectRepository(Message)
    private readonly messageRepo: Repository<Message>,
    private readonly indexService: SearchIndexService,
  ) {}

  async getHealth() {
    return this.indexService.getHealth();
  }

  async reindex(dto: ReindexSearchDto): Promise<SearchReindexResult> {
    const indices = dto.indices?.length
      ? dto.indices
      : [SearchIndexName.DOCUMENTS, SearchIndexName.TASKS, SearchIndexName.MESSAGES];
    const batchSize = dto.batchSize ?? 250;
    const startedAt = new Date();

    if (dto.ensureIndices !== false) {
      await this.indexService.ensureIndicesReady(indices);
    }

    const summary: Partial<Record<SearchIndexName, ReindexCounters>> = {};

    if (indices.includes(SearchIndexName.DOCUMENTS)) {
      summary[SearchIndexName.DOCUMENTS] = await this.reindexDocuments(batchSize);
    }
    if (indices.includes(SearchIndexName.TASKS)) {
      summary[SearchIndexName.TASKS] = await this.reindexTasks(batchSize);
    }
    if (indices.includes(SearchIndexName.MESSAGES)) {
      summary[SearchIndexName.MESSAGES] = await this.reindexMessages(batchSize);
    }

    if (dto.refresh !== false) {
      await this.indexService.refreshIndices(indices);
    }

    return {
      startedAt: startedAt.toISOString(),
      finishedAt: new Date().toISOString(),
      batchSize,
      indices,
      summary,
      health: await this.indexService.getHealth(indices),
    };
  }

  private async reindexDocuments(batchSize: number): Promise<ReindexCounters> {
    let offset = 0;
    let scanned = 0;
    let indexed = 0;

    while (true) {
      const documents = await this.documentRepo.find({
        order: { createdAt: 'ASC' },
        skip: offset,
        take: batchSize,
      });

      if (!documents.length) {
        break;
      }

      for (const document of documents) {
        await this.indexService.indexDocument({
          id: document.id,
          subject: document.subject,
          body: document.body,
          status: document.status,
          direction: document.direction,
          typeId: document.typeId,
          typeName: document.type?.name ?? null,
          registrationNumber: document.registrationNumber,
          classification: document.classification,
          createdById: document.createdById,
          createdAt: document.createdAt.toISOString(),
          updatedAt: document.updatedAt.toISOString(),
        });
      }

      scanned += documents.length;
      indexed += documents.length;
      offset += documents.length;
    }

    return { scanned, indexed, skipped: 0 };
  }

  private async reindexTasks(batchSize: number): Promise<ReindexCounters> {
    let offset = 0;
    let scanned = 0;
    let indexed = 0;

    while (true) {
      const tasks = await this.taskRepo.find({
        order: { createdAt: 'ASC' },
        skip: offset,
        take: batchSize,
      });

      if (!tasks.length) {
        break;
      }

      for (const task of tasks) {
        await this.indexService.indexTask({
          id: task.id,
          title: task.title,
          description: task.description,
          status: task.status,
          priority: task.priority,
          classification: task.classification,
          responsiblePositionId: task.responsiblePositionId,
          createdById: task.createdById,
          deadline: task.deadline,
          createdAt: task.createdAt.toISOString(),
          updatedAt: task.updatedAt.toISOString(),
        });
      }

      scanned += tasks.length;
      indexed += tasks.length;
      offset += tasks.length;
    }

    return { scanned, indexed, skipped: 0 };
  }

  private async reindexMessages(batchSize: number): Promise<ReindexCounters> {
    let offset = 0;
    let scanned = 0;
    let indexed = 0;
    let skipped = 0;

    while (true) {
      const messages = await this.messageRepo.find({
        where: { deletedAt: IsNull() },
        order: { createdAt: 'ASC' },
        skip: offset,
        take: batchSize,
      });

      if (!messages.length) {
        break;
      }

      for (const message of messages) {
        scanned += 1;

        if (!message.body) {
          skipped += 1;
          continue;
        }

        await this.indexService.indexMessage({
          id: message.id,
          channelId: message.channelId,
          body: message.body,
          senderId: message.senderId,
          senderPositionId: message.senderPositionId,
          classification: message.classification,
          sequence: message.sequence,
          createdAt: message.createdAt.toISOString(),
        });
        indexed += 1;
      }

      offset += messages.length;
    }

    return { scanned, indexed, skipped };
  }
}
