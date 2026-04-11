import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';

import { Task, TaskStatus, TaskPriority, TaskSource } from '../entities/task.entity';
import { TaskType } from '../entities/task-type.entity';
import { TaskAssignment, AssignmentType } from '../entities/task-assignment.entity';
import { TaskHistory } from '../entities/task-history.entity';
import { AuditService } from '../../audit/services/audit.service';
import { InboxService } from '../../inbox/services/inbox.service';

@Injectable()
export class TasksEdmsListener {
  private readonly logger = new Logger(TasksEdmsListener.name);

  constructor(
    @InjectRepository(Task)
    private readonly taskRepo: Repository<Task>,
    @InjectRepository(TaskType)
    private readonly typeRepo: Repository<TaskType>,
    @InjectRepository(TaskAssignment)
    private readonly assignmentRepo: Repository<TaskAssignment>,
    @InjectRepository(TaskHistory)
    private readonly historyRepo: Repository<TaskHistory>,
    private readonly auditService: AuditService,
    private readonly eventEmitter: EventEmitter2,
    private readonly inboxService: InboxService,
  ) {}

  @OnEvent('edms.resolution_issued')
  async onResolutionIssued(payload: {
    documentId: string;
    resolutionId: string;
    issuingPositionId: string;
    issuingUserId: string;
    text: string;
    priority: string;
    deadline: string | null;
    assignments: Array<{
      assignmentId: string;
      positionId: string;
      assignedUserId: string | null;
      executorRole: string;
      instruction: string | null;
      deadline: string | null;
    }>;
  }): Promise<void> {
    try {
      await this.inboxService.executeOnce(
        'tasks-edms-listener',
        'edms.resolution_issued',
        payload,
        async () => {
          const taskType = await this.resolveDocumentTaskType();
          if (!taskType) {
            this.logger.warn('No active TaskType found for document-generated tasks. Skipping task creation.');
            return;
          }

          const taskPriority = this.mapPriority(payload.priority);

          for (const assignment of payload.assignments) {
            await this.createTaskFromAssignment(
              taskType,
              payload,
              assignment,
              taskPriority,
            );
          }
        },
      );
    } catch (err) {
      this.logger.error(
        `Failed to create tasks from resolution ${payload.resolutionId}: ${(err as Error).message}`,
        (err as Error).stack,
      );
    }
  }

  // ─── EDMS → Tasks: deadline modified ─────────────────────────────────────────

  @OnEvent('edms.assignment_deadline_modified')
  async onAssignmentDeadlineModified(payload: {
    assignmentId: string;
    documentId: string;
    resolutionId: string;
    newDeadline: string;
    modifiedByUserId: string;
    modifiedByPositionId: string;
  }): Promise<void> {
    try {
      const task = await this.taskRepo.findOne({
        where: { sourceAssignmentId: payload.assignmentId },
      });
      if (!task) return;

      const previous = task.deadline;
      task.deadline = payload.newDeadline;
      task.isOverdue = false; // re-evaluate on next scheduler run
      task.overdueAt = null;
      await this.taskRepo.save(task);

      const history = this.historyRepo.create({
        taskId: task.id,
        eventType: 'deadline_modified_by_edms',
        actorId: payload.modifiedByUserId,
        actorPositionId: payload.modifiedByPositionId,
        previousValue: { deadline: previous },
        newValue: {
          deadline: payload.newDeadline,
          source: 'edms.assignment_deadline_modified',
          assignmentId: payload.assignmentId,
        },
      });
      await this.historyRepo.save(history);

      await this.auditService.emit({
        eventType: 'TASK_DEADLINE_MODIFIED_BY_EDMS',
        resourceType: 'task',
        resourceId: task.id,
        actorId: payload.modifiedByUserId,
        details: { previousDeadline: previous, newDeadline: payload.newDeadline, assignmentId: payload.assignmentId },
      });

      this.logger.log(
        `Task ${task.id} deadline updated to ${payload.newDeadline} via EDMS assignment ${payload.assignmentId}`,
      );
    } catch (err) {
      this.logger.error(
        `Failed to apply EDMS deadline modification for assignment ${payload.assignmentId}: ${(err as Error).message}`,
        (err as Error).stack,
      );
    }
  }

  // ─── EDMS → Tasks: assignment cancelled ──────────────────────────────────────

  @OnEvent('edms.assignment_cancelled')
  async onAssignmentCancelled(payload: {
    assignmentId: string;
    documentId: string;
    resolutionId: string;
    cancelledByUserId: string;
    cancelledByPositionId: string;
    reason: string | null;
  }): Promise<void> {
    try {
      const task = await this.taskRepo.findOne({
        where: { sourceAssignmentId: payload.assignmentId },
      });
      if (!task) return;

      const terminalStatuses = [
        TaskStatus.COMPLETED,
        TaskStatus.VERIFIED,
        TaskStatus.CANCELLED,
        TaskStatus.CLOSED,
      ];
      if (terminalStatuses.includes(task.status)) return;

      task.status = TaskStatus.CANCELLED;
      task.cancelReason = payload.reason ?? 'EDMS resolution assignment cancelled';
      task.cancelledAt = new Date();
      await this.taskRepo.save(task);

      const history = this.historyRepo.create({
        taskId: task.id,
        eventType: 'cancelled_by_edms',
        actorId: payload.cancelledByUserId,
        actorPositionId: payload.cancelledByPositionId,
        previousValue: { status: task.status },
        newValue: {
          status: TaskStatus.CANCELLED,
          reason: task.cancelReason,
          source: 'edms.assignment_cancelled',
          assignmentId: payload.assignmentId,
        },
      });
      await this.historyRepo.save(history);

      await this.auditService.emit({
        eventType: 'TASK_CANCELLED_BY_EDMS',
        resourceType: 'task',
        resourceId: task.id,
        actorId: payload.cancelledByUserId,
        details: { assignmentId: payload.assignmentId, reason: payload.reason },
      });

      this.eventEmitter.emit('notification.requested', {
        type: 'TASK_CANCELLED_BY_EDMS',
        recipientPositionId: task.responsiblePositionId,
        priority: 'normal',
        payload: { taskId: task.id, taskTitle: task.title, reason: task.cancelReason },
      });

      this.logger.log(
        `Task ${task.id} cancelled via EDMS assignment cancellation ${payload.assignmentId}`,
      );
    } catch (err) {
      this.logger.error(
        `Failed to cancel task for EDMS assignment ${payload.assignmentId}: ${(err as Error).message}`,
        (err as Error).stack,
      );
    }
  }

  // ─── EDMS → Tasks: executor reassigned ───────────────────────────────────────

  @OnEvent('edms.assignment_reassigned')
  async onAssignmentReassigned(payload: {
    assignmentId: string;
    documentId: string;
    resolutionId: string;
    newPositionId: string;
    newUserId: string | null;
    reassignedByUserId: string;
    reassignedByPositionId: string;
    reason: string | null;
  }): Promise<void> {
    try {
      const task = await this.taskRepo.findOne({
        where: { sourceAssignmentId: payload.assignmentId },
      });
      if (!task) return;

      const previousPositionId = task.responsiblePositionId;
      task.responsiblePositionId = payload.newPositionId;
      await this.taskRepo.save(task);

      const history = this.historyRepo.create({
        taskId: task.id,
        eventType: 'reassigned_by_edms',
        actorId: payload.reassignedByUserId,
        actorPositionId: payload.reassignedByPositionId,
        previousValue: { responsiblePositionId: previousPositionId },
        newValue: {
          responsiblePositionId: payload.newPositionId,
          source: 'edms.assignment_reassigned',
          assignmentId: payload.assignmentId,
          reason: payload.reason,
        },
      });
      await this.historyRepo.save(history);

      await this.auditService.emit({
        eventType: 'TASK_REASSIGNED_BY_EDMS',
        resourceType: 'task',
        resourceId: task.id,
        actorId: payload.reassignedByUserId,
        details: {
          previousPositionId,
          newPositionId: payload.newPositionId,
          assignmentId: payload.assignmentId,
          reason: payload.reason,
        },
      });

      // Notify new executor
      this.eventEmitter.emit('notification.requested', {
        type: 'TASK_REASSIGNED',
        recipientPositionId: payload.newPositionId,
        priority: 'normal',
        payload: {
          taskId: task.id,
          taskTitle: task.title,
          deadline: task.deadline,
          reason: payload.reason ?? 'EDMS executor reassignment',
        },
      });

      // Inform the previous executor
      this.eventEmitter.emit('notification.requested', {
        type: 'TASK_REASSIGNED_AWAY',
        recipientPositionId: previousPositionId,
        priority: 'normal',
        payload: {
          taskId: task.id,
          taskTitle: task.title,
          newPositionId: payload.newPositionId,
          reason: payload.reason,
        },
      });

      this.logger.log(
        `Task ${task.id} reassigned from ${previousPositionId} to ${payload.newPositionId} via EDMS`,
      );
    } catch (err) {
      this.logger.error(
        `Failed to reassign task for EDMS assignment ${payload.assignmentId}: ${(err as Error).message}`,
        (err as Error).stack,
      );
    }
  }

  // ─── Tasks → EDMS: task overdue ───────────────────────────────────────────────

  @OnEvent('task.overdue')
  async onTaskOverdueEdmsSync(payload: {
    taskId: string;
    responsiblePositionId: string;
    assigningPositionId: string;
    deadline: string | null;
  }): Promise<void> {
    const task = await this.taskRepo.findOne({ where: { id: payload.taskId } });
    if (!task || task.source !== TaskSource.DOCUMENT_GENERATED || !task.sourceAssignmentId) return;

    this.eventEmitter.emit('tasks.document_task_overdue', {
      taskId: task.id,
      sourceAssignmentId: task.sourceAssignmentId,
      sourceDocumentId: task.sourceDocumentId,
      sourceResolutionId: task.sourceResolutionId,
      responsiblePositionId: task.responsiblePositionId,
      deadline: task.deadline,
    });
  }

  // ─── Tasks → EDMS: cannot execute ────────────────────────────────────────────

  @OnEvent('task.status_changed')
  async onCannotExecuteEdmsSync(payload: {
    taskId: string;
    from: string;
    to: string;
    actorId: string;
    actorPositionId: string;
  }): Promise<void> {
    if (payload.to !== TaskStatus.CANNOT_EXECUTE) return;

    const task = await this.taskRepo.findOne({ where: { id: payload.taskId } });
    if (!task || task.source !== TaskSource.DOCUMENT_GENERATED || !task.sourceAssignmentId) return;

    this.eventEmitter.emit('tasks.document_task_cannot_execute', {
      taskId: task.id,
      sourceAssignmentId: task.sourceAssignmentId,
      sourceDocumentId: task.sourceDocumentId,
      sourceResolutionId: task.sourceResolutionId,
      responsiblePositionId: task.responsiblePositionId,
      reason: task.cannotExecuteReason,
      actorId: payload.actorId,
    });
  }

  // ─── Tasks → EDMS: task completed ────────────────────────────────────────────

  @OnEvent('task.status_changed')
  async onTaskStatusChanged(payload: {
    taskId: string;
    from: string;
    to: string;
    actorId: string;
    actorPositionId: string;
  }): Promise<void> {
    if (payload.to !== TaskStatus.COMPLETED && payload.to !== TaskStatus.VERIFIED) return;

    const task = await this.taskRepo.findOne({ where: { id: payload.taskId } });
    if (!task || task.source !== TaskSource.DOCUMENT_GENERATED || !task.sourceDocumentId) return;

    this.eventEmitter.emit('tasks.document_task_completed', {
      taskId: payload.taskId,
      sourceDocumentId: task.sourceDocumentId,
      sourceResolutionId: task.sourceResolutionId,
      responsiblePositionId: task.responsiblePositionId,
      completionReport: task.completionReport,
      actorId: payload.actorId,
    });
  }

  private async createTaskFromAssignment(
    taskType: TaskType,
    resolution: {
      documentId: string;
      resolutionId: string;
      issuingPositionId: string;
      issuingUserId: string;
      text: string;
      deadline: string | null;
    },
    assignment: {
      assignmentId: string;
      positionId: string;
      assignedUserId: string | null;
      executorRole: string;
      instruction: string | null;
      deadline: string | null;
    },
    priority: TaskPriority,
  ): Promise<void> {
    const task = this.taskRepo.create({
      typeId: taskType.id,
      title: this.buildTaskTitle(resolution.text),
      description: assignment.instruction ?? resolution.text,
      status: TaskStatus.ASSIGNED,
      priority,
      source: TaskSource.DOCUMENT_GENERATED,
      classification: 1,
      assigningPositionId: resolution.issuingPositionId,
      createdById: resolution.issuingUserId,
      responsiblePositionId: assignment.positionId,
      deadline: assignment.deadline ?? resolution.deadline ?? null,
      sourceDocumentId: resolution.documentId,
      sourceResolutionId: resolution.resolutionId,
      sourceAssignmentId: assignment.assignmentId,
    });
    await this.taskRepo.save(task);

    const taskAssignment = this.assignmentRepo.create({
      taskId: task.id,
      positionId: assignment.positionId,
      assignedUserId: assignment.assignedUserId,
      assignmentType: AssignmentType.PRIMARY,
      assignedByPositionId: resolution.issuingPositionId,
      assignedByUserId: resolution.issuingUserId,
      deadline: assignment.deadline ?? resolution.deadline ?? null,
    });
    await this.assignmentRepo.save(taskAssignment);

    const history = this.historyRepo.create({
      taskId: task.id,
      eventType: 'task_created_from_resolution',
      actorId: resolution.issuingUserId,
      actorPositionId: resolution.issuingPositionId,
      previousValue: null,
      newValue: {
        source: TaskSource.DOCUMENT_GENERATED,
        documentId: resolution.documentId,
        resolutionId: resolution.resolutionId,
        assignmentId: assignment.assignmentId,
        status: TaskStatus.ASSIGNED,
      },
    });
    await this.historyRepo.save(history);

    await this.auditService.emit({
      eventType: 'TASK_CREATED_FROM_EDMS_RESOLUTION',
      resourceType: 'task',
      resourceId: task.id,
      actorId: resolution.issuingUserId,
      details: {
        documentId: resolution.documentId,
        resolutionId: resolution.resolutionId,
        assignmentId: assignment.assignmentId,
        responsiblePositionId: assignment.positionId,
      },
    });

    this.eventEmitter.emit('tasks.edms_task_created', {
      assignmentId: assignment.assignmentId,
      taskId: task.id,
      documentId: resolution.documentId,
    });

    this.logger.log(
      `Task ${task.id} created from EDMS resolution ${resolution.resolutionId} for position ${assignment.positionId}`,
    );
  }

  private async resolveDocumentTaskType(): Promise<TaskType | null> {
    const type = await this.typeRepo.findOne({
      where: { name: 'Document-Generated Task', active: true },
    });
    if (type) return type;

    try {
      const newType = this.typeRepo.create({
        name: 'Document-Generated Task',
        description: 'Automatically created from EDMS resolution assignments',
        defaultPriority: 2,
        requiresAcceptance: false,
        requiresVerification: true,
        supportsCoExecutors: true,
        supportsSubtasks: true,
        supportsDraft: false,
        active: true,
      });
      return this.typeRepo.save(newType);
    } catch {
      return this.typeRepo.findOne({ where: { active: true } });
    }
  }

  private buildTaskTitle(resolutionText: string): string {
    const maxLen = 200;
    const cleaned = resolutionText.trim().replace(/\n/g, ' ');
    return cleaned.length > maxLen ? cleaned.substring(0, maxLen - 3) + '...' : cleaned;
  }

  private mapPriority(resolutionPriority: string): TaskPriority {
    switch (resolutionPriority) {
      case 'emergency':
        return TaskPriority.CRITICAL;
      case 'urgent':
        return TaskPriority.HIGH;
      default:
        return TaskPriority.NORMAL;
    }
  }
}
