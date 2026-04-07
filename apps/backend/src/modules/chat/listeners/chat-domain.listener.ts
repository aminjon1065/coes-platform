import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { ChatService } from '../services/chat.service';
import { PresenceService, PresenceStatus } from '../services/presence.service';
import { ChannelType } from '../entities/channel.entity';
import { MemberRole } from '../entities/channel-member.entity';

/**
 * Subscribes to domain events from Tasks, EDMS, and Org modules
 * to automatically create/manage linked channels.
 *
 * 2.3.4 — task.channel_requested → creates a TASK_LINKED channel
 * 2.4.4 — org.department_created → creates a DEPARTMENT channel
 * 2.4.5 — edms.document.registered → creates a DOCUMENT_LINKED channel (for workflow docs)
 */
@Injectable()
export class ChatDomainListener {
  private readonly logger = new Logger(ChatDomainListener.name);

  constructor(
    private readonly chatService: ChatService,
    private readonly presenceService: PresenceService,
  ) {}

  // ─── Task-linked channel (2.3.4 / 2.4.5) ─────────────────────────────────────

  @OnEvent('task.channel_requested')
  async onTaskChannelRequested(payload: {
    taskId: string;
    taskTitle: string;
    responsiblePositionId: string;
    assigningPositionId: string;
  }): Promise<void> {
    try {
      const memberIds = Array.from(
        new Set([payload.responsiblePositionId, payload.assigningPositionId]),
      );

      const channel = await this.chatService.createLinkedChannel({
        type: ChannelType.TASK_LINKED,
        name: `Task: ${payload.taskTitle.substring(0, 100)}`,
        classification: 1,
        linkedEntityId: payload.taskId,
        linkedEntityType: 'task',
        memberPositionIds: memberIds,
      });

      this.logger.log(`Created task-linked channel ${channel.id} for task ${payload.taskId}`);
    } catch (err) {
      this.logger.error(
        `Failed to create task-linked channel for task ${payload.taskId}: ${(err as Error).message}`,
        (err as Error).stack,
      );
    }
  }

  // ─── Task executor added → add to task-linked channel (2.4.5) ────────────────

  @OnEvent('task.executor_added')
  async onTaskExecutorAdded(payload: {
    taskId: string;
    positionId: string;
    actorId: string;
  }): Promise<void> {
    try {
      // Find the task-linked channel for this task
      const channel = await this.chatService['channelRepo'].findOne({
        where: { linkedEntityId: payload.taskId, linkedEntityType: 'task' },
      });
      if (!channel) return;

      await this.chatService['addMember'](
        channel.id,
        payload.positionId,
        null,
        MemberRole.MEMBER,
        'task_derived',
      );
    } catch (err) {
      this.logger.error(
        `Failed to add executor ${payload.positionId} to task channel for task ${payload.taskId}: ${(err as Error).message}`,
      );
    }
  }

  // ─── Task closed → make channel read-only ─────────────────────────────────────

  @OnEvent('task.status_changed')
  async onTaskStatusChanged(payload: {
    taskId: string;
    from: string;
    to: string;
  }): Promise<void> {
    const terminalStatuses = ['closed', 'cancelled', 'verified'];
    if (!terminalStatuses.includes(payload.to)) return;

    try {
      await this.chatService.setChannelReadOnly(payload.taskId, 'task');
    } catch (err) {
      this.logger.error(
        `Failed to set task channel read-only for task ${payload.taskId}: ${(err as Error).message}`,
      );
    }
  }

  // ─── Document-linked channel (2.4.5) ─────────────────────────────────────────

  @OnEvent('edms.document.registered')
  async onDocumentRegistered(payload: {
    documentId: string;
    registrationNumber: string;
    actorId: string;
  }): Promise<void> {
    try {
      await this.chatService.createLinkedChannel({
        type: ChannelType.DOCUMENT_LINKED,
        name: `Document: ${payload.registrationNumber}`,
        classification: 1, // Real impl reads document classification
        linkedEntityId: payload.documentId,
        linkedEntityType: 'document',
        memberPositionIds: [],
        createdById: payload.actorId,
      });
      this.logger.log(`Created document-linked channel for document ${payload.documentId}`);
    } catch (err) {
      this.logger.error(
        `Failed to create document-linked channel for document ${payload.documentId}: ${(err as Error).message}`,
      );
    }
  }

  @OnEvent('workflow.step_activated')
  async onWorkflowStepActivated(payload: {
    documentId: string;
    stepId: string;
    positionId: string;
  }): Promise<void> {
    try {
      const channel = await this.chatService['channelRepo'].findOne({
        where: { linkedEntityId: payload.documentId, linkedEntityType: 'document' },
      });
      if (!channel) return;
      await this.chatService['addMember'](
        channel.id,
        payload.positionId,
        null,
        MemberRole.MEMBER,
        'document_derived',
      );
    } catch (err) {
      this.logger.error(
        `Failed to add workflow participant to document channel: ${(err as Error).message}`,
      );
    }
  }

  // ─── Document archived → channel read-only ────────────────────────────────────

  @OnEvent('workflow.completed')
  async onWorkflowCompleted(payload: { documentId: string }): Promise<void> {
    try {
      await this.chatService.setChannelReadOnly(payload.documentId, 'document');
    } catch (err) {
      this.logger.error(
        `Failed to set document channel read-only for document ${payload.documentId}: ${(err as Error).message}`,
      );
    }
  }

  // ─── Presence: disconnect on token expiry / explicit logout ──────────────────

  @OnEvent('iam.user_logged_out')
  async onUserLoggedOut(payload: { userId: string }): Promise<void> {
    await this.presenceService.setPresence(payload.userId, PresenceStatus.OFFLINE).catch(() => {});
  }
}
