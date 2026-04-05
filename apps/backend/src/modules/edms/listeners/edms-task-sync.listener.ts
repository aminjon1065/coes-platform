import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { ResolutionService } from '../services/resolution.service';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ExecutorAssignment, ExecutorAssignmentStatus } from '../entities/executor-assignment.entity';
import { Document, DocumentStatus } from '../entities/document.entity';

/**
 * Listens for Task domain events and syncs status back into the EDMS
 * executor assignment records (Phase 2.2 — bidirectional sync).
 */
@Injectable()
export class EdmsTaskSyncListener {
  private readonly logger = new Logger(EdmsTaskSyncListener.name);

  constructor(
    private readonly resolutionService: ResolutionService,
    @InjectRepository(ExecutorAssignment)
    private readonly assignmentRepo: Repository<ExecutorAssignment>,
    @InjectRepository(Document)
    private readonly documentRepo: Repository<Document>,
  ) {}

  /**
   * When TasksEdmsListener creates a task from a resolution assignment,
   * link the task ID back to the EDMS executor assignment record.
   */
  @OnEvent('tasks.edms_task_created')
  async onEdmsTaskCreated(payload: {
    assignmentId: string;
    taskId: string;
    documentId: string;
  }): Promise<void> {
    try {
      await this.resolutionService.linkTask(payload.assignmentId, payload.taskId);
      this.logger.log(
        `Linked task ${payload.taskId} to EDMS executor assignment ${payload.assignmentId}`,
      );
    } catch (err) {
      this.logger.error(
        `Failed to link task ${payload.taskId} to assignment ${payload.assignmentId}: ${(err as Error).message}`,
        (err as Error).stack,
      );
    }
  }

  /**
   * When a document-generated task is completed, update the corresponding
   * EDMS executor assignment status.
   */
  @OnEvent('tasks.document_task_completed')
  async onDocumentTaskCompleted(payload: {
    taskId: string;
    sourceDocumentId: string;
    sourceResolutionId: string | null;
    responsiblePositionId: string;
    completionReport: string | null;
    actorId: string;
  }): Promise<void> {
    try {
      const assignment = await this.assignmentRepo.findOne({
        where: { linkedTaskId: payload.taskId },
      });
      if (!assignment) return;

      assignment.status = ExecutorAssignmentStatus.COMPLETED;
      assignment.completionReport = payload.completionReport ?? null;
      assignment.completedAt = new Date();
      await this.assignmentRepo.save(assignment);

      this.logger.log(
        `EDMS executor assignment ${assignment.id} marked complete via task ${payload.taskId}`,
      );

      // Check if all primary assignments for the document are complete
      const allAssignments = await this.assignmentRepo.find({
        where: { documentId: payload.sourceDocumentId },
      });
      const allPrimaryComplete = allAssignments
        .filter(a => a.executorRole === 'primary')
        .every(a => a.status === ExecutorAssignmentStatus.COMPLETED);

      if (allPrimaryComplete) {
        // Transition document to COMPLETED if it's still in workflow
        const doc = await this.documentRepo.findOne({ where: { id: payload.sourceDocumentId } });
        if (doc && doc.status === DocumentStatus.IN_WORKFLOW) {
          await this.documentRepo.update(payload.sourceDocumentId, {
            status: DocumentStatus.COMPLETED,
          });
          this.logger.log(
            `Document ${payload.sourceDocumentId} auto-completed — all executor assignments done`,
          );
        }
      }
    } catch (err) {
      this.logger.error(
        `Failed to sync task completion to EDMS for task ${payload.taskId}: ${(err as Error).message}`,
        (err as Error).stack,
      );
    }
  }
}
