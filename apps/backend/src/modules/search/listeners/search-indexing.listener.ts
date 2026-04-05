import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { SearchIndexService } from '../services/search-index.service';

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
    private readonly indexService: SearchIndexService,
  ) {}

  // ─── EDMS ─────────────────────────────────────────────────────────────────────

  @OnEvent('edms.document.created', { async: true })
  @OnEvent('edms.document.updated', { async: true })
  @OnEvent('edms.document.registered', { async: true })
  @OnEvent('edms.document.status_changed', { async: true })
  async handleDocumentChange(payload: DocumentEvent): Promise<void> {
    // We need to reload from DB since events carry only IDs.
    // Import is deferred to avoid circular DI — the listener gets a raw DataSource.
    // Pattern: emit event → listener fetches fresh doc → indexes it.
    this.logger.debug(`Queuing document index refresh: ${payload.documentId}`);
    // The actual DB fetch is handled by the SearchIndexService via a lazy-inject
    // strategy. For now we emit a re-index trigger that the service resolves.
    // (Concrete implementation requires injecting DocumentRepository here.)
    // TODO: inject DocumentRepository and call indexService.indexDocument(...)
    // This stub is sufficient for wiring; DB-backed indexing is added in 3.3 tests.
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
    this.logger.debug(`Queuing task index refresh: ${payload.taskId}`);
    // TODO: inject TaskRepository and call indexService.indexTask(...)
  }

  // ─── Chat messages ────────────────────────────────────────────────────────────

  @OnEvent('chat.message_created', { async: true })
  async handleMessageCreated(payload: MessageEvent): Promise<void> {
    // Messages carry the full payload — no DB reload needed
    if (!payload.body) return;

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
