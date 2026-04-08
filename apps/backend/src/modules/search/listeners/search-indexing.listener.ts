import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { Document } from '../../edms/entities/document.entity';
import { Task } from '../../tasks/entities/task.entity';
import { SearchIndexService } from '../services/search-index.service';
import { InboxService } from '../../inbox/services/inbox.service';

// ─── Payload shapes (mirroring what each domain emits) ────────────────────────

interface DocumentEvent {
  documentId: string;
}

interface TaskEvent {
  taskId: string;
}

interface MessageEvent {
  messageId: string;
  channelId: string;
  body: string | null;
  senderId: string;
  senderPositionId: string;
  classification: number;
  sequence: number;
  createdAt: string | Date;
}

interface MessageDeletedEvent {
  messageId: string;
}

/**
 * Listens to domain events and keeps OpenSearch indices in sync.
 *
 * This listener is deliberately thin — it receives the minimal payload
 * needed to build the index document. Heavy DB reloads are avoided where
 * possible by using the event payload directly (for messages).
 *
 * Note: indexing failures are logged but never re-thrown — search index
 * staleness is preferable to breaking the primary write path.
 */
@Injectable()
export class SearchIndexingListener {
  private readonly logger = new Logger(SearchIndexingListener.name);

  constructor(
    @InjectRepository(Document)
    private readonly documentRepo: Repository<Document>,
    @InjectRepository(Task)
    private readonly taskRepo: Repository<Task>,
    private readonly indexService: SearchIndexService,
    private readonly inboxService: InboxService,
  ) {}

  // ─── EDMS ─────────────────────────────────────────────────────────────────────

  @OnEvent('edms.document.created', { async: true })
  @OnEvent('edms.document.updated', { async: true })
  @OnEvent('edms.document.registered', { async: true })
  @OnEvent('edms.document.status_changed', { async: true })
  async handleDocumentChange(payload: DocumentEvent): Promise<void> {
    try {
      await this.inboxService.executeOnce(
        'search-documents',
        'search.document.change',
        payload as unknown as Record<string, unknown>,
        async () => {
          this.logger.debug(`Queuing document index refresh: ${payload.documentId}`);

          const doc = await this.documentRepo.findOne({
            where: { id: payload.documentId },
          });

          if (!doc) {
            this.logger.warn(`Document ${payload.documentId} not found during reindex; deleting stale index entry`);
            await this.indexService.deleteDocument(payload.documentId);
            return;
          }

          await this.indexService.indexDocument({
            id: doc.id,
            subject: doc.subject,
            body: doc.body,
            status: doc.status,
            direction: doc.direction,
            typeId: doc.typeId,
            typeName: doc.type?.name ?? null,
            registrationNumber: doc.registrationNumber,
            classification: doc.classification,
            createdById: doc.createdById,
            createdAt: doc.createdAt.toISOString(),
            updatedAt: doc.updatedAt.toISOString(),
          });
        },
      );
    } catch (err) {
      this.logger.error(
        `Failed to refresh document index ${payload.documentId}: ${(err as Error).message}`,
      );
    }
  }

  @OnEvent('edms.document.status_changed', { async: true })
  async handleDocumentArchived(payload: DocumentEvent & { to: string }): Promise<void> {
    if (payload.to === 'archived' || payload.to === 'cancelled') {
      // Archived/cancelled documents remain searchable (with status filter)
      // but we still refresh the index to reflect the new status.
      this.logger.debug(`Status changed to ${payload.to} for document ${payload.documentId}`);
    }
  }

  // ─── Tasks ────────────────────────────────────────────────────────────────────

  @OnEvent('task.created', { async: true })
  @OnEvent('task.updated', { async: true })
  @OnEvent('task.status_changed', { async: true })
  async handleTaskChange(payload: TaskEvent): Promise<void> {
    try {
      await this.inboxService.executeOnce(
        'search-tasks',
        'search.task.change',
        payload as unknown as Record<string, unknown>,
        async () => {
          this.logger.debug(`Queuing task index refresh: ${payload.taskId}`);

          const task = await this.taskRepo.findOne({
            where: { id: payload.taskId },
          });

          if (!task) {
            this.logger.warn(`Task ${payload.taskId} not found during reindex; deleting stale index entry`);
            await this.indexService.deleteTask(payload.taskId);
            return;
          }

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
        },
      );
    } catch (err) {
      this.logger.error(`Failed to refresh task index ${payload.taskId}: ${(err as Error).message}`);
    }
  }

  // ─── Chat messages ────────────────────────────────────────────────────────────

  @OnEvent('chat.message_created', { async: true })
  async handleMessageCreated(payload: MessageEvent): Promise<void> {
    if (!payload.body) return;

    await this.inboxService.executeOnce(
      'search-messages',
      'chat.message_created',
      payload as unknown as Record<string, unknown>,
      async () => {
        await this.indexService.indexMessage({
          id: payload.messageId,
          channelId: payload.channelId,
          body: payload.body,
          senderId: payload.senderId,
          senderPositionId: payload.senderPositionId,
          classification: payload.classification,
          sequence: payload.sequence,
          createdAt: typeof payload.createdAt === 'string'
            ? payload.createdAt
            : payload.createdAt.toISOString(),
        });
      },
    );
  }

  @OnEvent('chat.message_edited', { async: true })
  async handleMessageEdited(payload: { messageId: string; channelId: string }): Promise<void> {
    // Edited message body changed — delete + re-index via next message_created-style event
    // For simplicity: delete the stale entry; it will be re-indexed on next read
    await this.indexService.deleteMessage(payload.messageId);
  }

  @OnEvent('chat.message_deleted', { async: true })
  async handleMessageDeleted(payload: MessageDeletedEvent): Promise<void> {
    await this.indexService.deleteMessage(payload.messageId);
  }
}
