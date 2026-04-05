import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';

import { Task, TaskStatus } from '../entities/task.entity';
import { TaskHistory } from '../entities/task-history.entity';
import { OrgService } from '../../org/services/org.service';

/**
 * 2.3.2 — Escalation alerts for overdue tasks.
 *
 * When a task is marked overdue (by TasksService.markOverdueTasks() scheduler),
 * this listener walks the command chain and emits notification events to:
 *   1. The responsible executor's direct supervisor
 *   2. The assigning authority
 *
 * The Notification domain will subscribe to 'notification.requested' events
 * and handle delivery channel selection and user preferences.
 */
@Injectable()
export class TasksEscalationListener {
  private readonly logger = new Logger(TasksEscalationListener.name);

  constructor(
    @InjectRepository(Task)
    private readonly taskRepo: Repository<Task>,
    @InjectRepository(TaskHistory)
    private readonly historyRepo: Repository<TaskHistory>,
    private readonly orgService: OrgService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  @OnEvent('task.overdue')
  async onTaskOverdue(payload: {
    taskId: string;
    responsiblePositionId: string;
    assigningPositionId: string;
    deadline: string | null;
  }): Promise<void> {
    try {
      const task = await this.taskRepo.findOne({ where: { id: payload.taskId } });
      if (!task) return;

      // Walk command chain to find direct supervisor of responsible executor
      const chain = await this.orgService.getCommandChain(payload.responsiblePositionId);
      // chain[0] = the position itself, chain[1] = direct supervisor
      const supervisorPositionId = chain.length > 1 ? chain[1].id : null;

      const escalationTargets: Array<{ positionId: string; role: string }> = [];

      if (supervisorPositionId && supervisorPositionId !== payload.assigningPositionId) {
        escalationTargets.push({ positionId: supervisorPositionId, role: 'supervisor' });
      }

      // Always notify the assigning authority
      escalationTargets.push({ positionId: payload.assigningPositionId, role: 'assigning_authority' });

      for (const target of escalationTargets) {
        this.eventEmitter.emit('notification.requested', {
          type: 'TASK_OVERDUE_ESCALATION',
          recipientPositionId: target.positionId,
          priority: 'high',
          payload: {
            taskId: task.id,
            taskTitle: task.title,
            responsiblePositionId: payload.responsiblePositionId,
            deadline: payload.deadline,
            role: target.role,
          },
        });
      }

      // Also notify the responsible executor themselves
      this.eventEmitter.emit('notification.requested', {
        type: 'TASK_OVERDUE_EXECUTOR',
        recipientPositionId: payload.responsiblePositionId,
        priority: 'high',
        payload: {
          taskId: task.id,
          taskTitle: task.title,
          deadline: payload.deadline,
        },
      });

      await this.recordHistory(task.id, escalationTargets.map(t => t.positionId));

      this.logger.log(
        `Escalation notifications emitted for overdue task ${task.id} to ${escalationTargets.length + 1} recipients`,
      );
    } catch (err) {
      this.logger.error(
        `Escalation failed for task ${payload.taskId}: ${(err as Error).message}`,
        (err as Error).stack,
      );
    }
  }

  /**
   * When a task CANNOT_EXECUTE is reported, escalate to supervisor + assigning authority.
   */
  @OnEvent('task.status_changed')
  async onCannotExecute(payload: {
    taskId: string;
    from: string;
    to: string;
    actorId: string;
    actorPositionId: string;
  }): Promise<void> {
    if (payload.to !== TaskStatus.CANNOT_EXECUTE) return;

    try {
      const task = await this.taskRepo.findOne({ where: { id: payload.taskId } });
      if (!task) return;

      const chain = await this.orgService.getCommandChain(task.responsiblePositionId);
      const supervisorPositionId = chain.length > 1 ? chain[1].id : null;

      if (supervisorPositionId) {
        this.eventEmitter.emit('notification.requested', {
          type: 'TASK_CANNOT_EXECUTE',
          recipientPositionId: supervisorPositionId,
          priority: 'high',
          payload: {
            taskId: task.id,
            taskTitle: task.title,
            executorPositionId: task.responsiblePositionId,
            reason: task.cannotExecuteReason,
          },
        });
      }

      this.eventEmitter.emit('notification.requested', {
        type: 'TASK_CANNOT_EXECUTE',
        recipientPositionId: task.assigningPositionId,
        priority: 'high',
        payload: {
          taskId: task.id,
          taskTitle: task.title,
          executorPositionId: task.responsiblePositionId,
          reason: task.cannotExecuteReason,
        },
      });
    } catch (err) {
      this.logger.error(
        `Cannot-execute escalation failed for task ${payload.taskId}: ${(err as Error).message}`,
        (err as Error).stack,
      );
    }
  }

  /**
   * Notify the assigning authority when executor completes a task requiring verification.
   */
  @OnEvent('task.status_changed')
  async onTaskCompleted(payload: {
    taskId: string;
    from: string;
    to: string;
    actorId: string;
    actorPositionId: string;
  }): Promise<void> {
    if (payload.to !== TaskStatus.COMPLETED) return;

    try {
      const task = await this.taskRepo.findOne({ where: { id: payload.taskId }, relations: ['type'] });
      if (!task || !task.type?.requiresVerification) return;

      this.eventEmitter.emit('notification.requested', {
        type: 'TASK_AWAITING_VERIFICATION',
        recipientPositionId: task.assigningPositionId,
        priority: 'normal',
        payload: {
          taskId: task.id,
          taskTitle: task.title,
          executorPositionId: task.responsiblePositionId,
          completionReport: task.completionReport,
        },
      });
    } catch (err) {
      this.logger.error(
        `Completion notification failed for task ${payload.taskId}: ${(err as Error).message}`,
        (err as Error).stack,
      );
    }
  }

  private async recordHistory(taskId: string, escalatedToPositions: string[]): Promise<void> {
    const entry = this.historyRepo.create({
      taskId,
      eventType: 'overdue_escalation_sent',
      actorId: 'system',
      actorPositionId: null,
      previousValue: null,
      newValue: { escalatedToPositions },
    });
    await this.historyRepo.save(entry).catch((err) => {
      this.logger.error(`Failed to record escalation history: ${err.message}`);
    });
  }
}
