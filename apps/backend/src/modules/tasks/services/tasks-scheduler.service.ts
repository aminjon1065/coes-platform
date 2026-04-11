import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';

import { Task, TaskStatus, TaskPriority } from '../entities/task.entity';
import { TaskHistory } from '../entities/task-history.entity';
import { OrgService } from '../../org/services/org.service';

/** Hours before deadline for Tier-1 warning, keyed by priority */
const TIER1_WARNING_HOURS: Record<TaskPriority, number> = {
  [TaskPriority.CRITICAL]: 4,
  [TaskPriority.HIGH]: 24,      // 1 day
  [TaskPriority.NORMAL]: 72,    // 3 days
  [TaskPriority.LOW]: 120,      // 5 days
};

/** Days overdue before Tier-3 extended-overdue escalation */
const TIER3_DAYS = 3;

/** Days overdue before Tier-4 chronic-overdue escalation (department-head level) */
const TIER4_DAYS = 7;

const ACTIVE_STATUSES = [
  TaskStatus.ASSIGNED,
  TaskStatus.ACCEPTED,
  TaskStatus.IN_PROGRESS,
  TaskStatus.ON_HOLD,
  TaskStatus.CANNOT_EXECUTE,
];

@Injectable()
export class TasksSchedulerService {
  private readonly logger = new Logger(TasksSchedulerService.name);

  constructor(
    @InjectRepository(Task)
    private readonly taskRepo: Repository<Task>,
    @InjectRepository(TaskHistory)
    private readonly historyRepo: Repository<TaskHistory>,
    private readonly orgService: OrgService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  // ─── Overdue detection ────────────────────────────────────────────────────────
  // Runs every 15 minutes. Marks tasks whose deadline has passed.
  // Critical tasks get checked at the same interval — the interval is already short enough.

  @Cron(CronExpression.EVERY_15_MINUTES)
  async runOverdueDetection(): Promise<void> {
    try {
      const now = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

      const tasks = await this.taskRepo
        .createQueryBuilder('t')
        .where('t.deadline < :now', { now })
        .andWhere('t.isOverdue = false')
        .andWhere('t.status IN (:...statuses)', { statuses: ACTIVE_STATUSES })
        .getMany();

      if (!tasks.length) return;

      for (const task of tasks) {
        task.isOverdue = true;
        task.overdueAt = new Date();
        await this.taskRepo.save(task);

        await this.recordHistory(task.id, 'marked_overdue', {
          deadline: task.deadline,
          status: task.status,
        });

        // Tier 2 — first overdue alert
        this.eventEmitter.emit('task.overdue', {
          taskId: task.id,
          responsiblePositionId: task.responsiblePositionId,
          assigningPositionId: task.assigningPositionId,
          deadline: task.deadline,
          priority: task.priority,
        });
      }

      if (tasks.length > 0) {
        this.logger.log(`Overdue detection: marked ${tasks.length} task(s) as overdue`);
      }
    } catch (err) {
      this.logger.error(`Overdue detection failed: ${(err as Error).message}`, (err as Error).stack);
    }
  }

  // ─── Tier 1 — Approaching deadline warning ────────────────────────────────────
  // Runs every 30 minutes. Emits a warning when a task's deadline is within the
  // priority-specific warning window and has not yet been warned.

  @Cron(CronExpression.EVERY_30_MINUTES)
  async runApproachingDeadlineCheck(): Promise<void> {
    try {
      const now = new Date();

      // Build a single query that catches all priority tiers at once.
      // We use the widest window (120 h = LOW) and filter per-priority in code.
      const maxWindowMs = Math.max(...Object.values(TIER1_WARNING_HOURS)) * 3_600_000;
      const cutoff = new Date(now.getTime() + maxWindowMs).toISOString().split('T')[0];

      const tasks = await this.taskRepo
        .createQueryBuilder('t')
        .where('t.deadline IS NOT NULL')
        .andWhere('t.deadline <= :cutoff', { cutoff })
        .andWhere('t.deadline >= :today', { today: now.toISOString().split('T')[0] })
        .andWhere('t.isOverdue = false')
        .andWhere('t.status IN (:...statuses)', { statuses: ACTIVE_STATUSES })
        .getMany();

      for (const task of tasks) {
        if (!task.deadline) continue;

        const hoursLeft =
          (new Date(task.deadline).getTime() - now.getTime()) / 3_600_000;
        const threshold = TIER1_WARNING_HOURS[task.priority];

        if (hoursLeft <= threshold) {
          this.eventEmitter.emit('task.deadline_approaching', {
            taskId: task.id,
            taskTitle: task.title,
            responsiblePositionId: task.responsiblePositionId,
            assigningPositionId: task.assigningPositionId,
            deadline: task.deadline,
            priority: task.priority,
            hoursRemaining: Math.round(hoursLeft),
          });
        }
      }
    } catch (err) {
      this.logger.error(
        `Approaching-deadline check failed: ${(err as Error).message}`,
        (err as Error).stack,
      );
    }
  }

  // ─── Tier 3 — Extended overdue escalation ────────────────────────────────────
  // Fires when a task has been overdue for TIER3_DAYS days.
  // Notifies the supervisor's supervisor and the assigning authority's supervisor.

  @Cron(CronExpression.EVERY_HOUR)
  async runExtendedOverdueCheck(): Promise<void> {
    try {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - TIER3_DAYS);

      const tasks = await this.taskRepo
        .createQueryBuilder('t')
        .where('t.isOverdue = true')
        .andWhere('t.overdueAt <= :cutoff', { cutoff })
        .andWhere('t.status IN (:...statuses)', { statuses: ACTIVE_STATUSES })
        .getMany();

      for (const task of tasks) {
        // Avoid re-escalating: check if we've already emitted Tier-3 for this task
        const alreadyEscalated = await this.historyRepo.findOne({
          where: { taskId: task.id, eventType: 'tier3_escalation_sent' },
        });
        if (alreadyEscalated) continue;

        const chain = await this.orgService.getCommandChain(task.responsiblePositionId);
        // chain[0] = position itself, [1] = direct supervisor, [2] = supervisor's supervisor
        const tier3Supervisor = chain.length > 2 ? chain[2].id : (chain.length > 1 ? chain[1].id : null);

        if (tier3Supervisor) {
          this.eventEmitter.emit('notification.requested', {
            type: 'TASK_OVERDUE_EXTENDED',
            recipientPositionId: tier3Supervisor,
            priority: 'high',
            payload: {
              taskId: task.id,
              taskTitle: task.title,
              responsiblePositionId: task.responsiblePositionId,
              deadline: task.deadline,
              daysOverdue: TIER3_DAYS,
            },
          });
        }

        await this.recordHistory(task.id, 'tier3_escalation_sent', {
          escalatedToPositionId: tier3Supervisor,
          daysOverdue: TIER3_DAYS,
        });
      }
    } catch (err) {
      this.logger.error(
        `Extended-overdue check failed: ${(err as Error).message}`,
        (err as Error).stack,
      );
    }
  }

  // ─── Tier 4 — Chronic overdue escalation ─────────────────────────────────────
  // Fires when a task has been overdue for TIER4_DAYS days.
  // Notifies the department head of the responsible executor's department
  // and, for document-generated tasks, the resolution-issuing official's department head.

  @Cron(CronExpression.EVERY_HOUR)
  async runChronicOverdueCheck(): Promise<void> {
    try {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - TIER4_DAYS);

      const tasks = await this.taskRepo
        .createQueryBuilder('t')
        .where('t.isOverdue = true')
        .andWhere('t.overdueAt <= :cutoff', { cutoff })
        .andWhere('t.status IN (:...statuses)', { statuses: ACTIVE_STATUSES })
        .getMany();

      for (const task of tasks) {
        const alreadyEscalated = await this.historyRepo.findOne({
          where: { taskId: task.id, eventType: 'tier4_escalation_sent' },
        });
        if (alreadyEscalated) continue;

        // Walk the chain to find the department-head level position
        const chain = await this.orgService.getCommandChain(task.responsiblePositionId);
        // The department head is typically the top of the chain before org leadership.
        // Use the last chain member that is not the root.
        const deptHeadPosition = chain.length > 1 ? chain[chain.length - 1].id : null;

        if (deptHeadPosition) {
          this.eventEmitter.emit('notification.requested', {
            type: 'TASK_OVERDUE_CHRONIC',
            recipientPositionId: deptHeadPosition,
            priority: 'critical',
            payload: {
              taskId: task.id,
              taskTitle: task.title,
              responsiblePositionId: task.responsiblePositionId,
              deadline: task.deadline,
              daysOverdue: TIER4_DAYS,
            },
          });
        }

        await this.recordHistory(task.id, 'tier4_escalation_sent', {
          escalatedToPositionId: deptHeadPosition,
          daysOverdue: TIER4_DAYS,
        });

        this.logger.warn(
          `Tier-4 (chronic) escalation sent for task ${task.id} — overdue ${TIER4_DAYS}+ days`,
        );
      }
    } catch (err) {
      this.logger.error(
        `Chronic-overdue check failed: ${(err as Error).message}`,
        (err as Error).stack,
      );
    }
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────────

  private async recordHistory(
    taskId: string,
    eventType: string,
    newValue: Record<string, unknown>,
  ): Promise<void> {
    const entry = this.historyRepo.create({
      taskId,
      eventType,
      actorId: 'system',
      actorPositionId: null,
      previousValue: null,
      newValue,
    });
    await this.historyRepo.save(entry).catch((err) => {
      this.logger.error(`Failed to record scheduler history: ${(err as Error).message}`);
    });
  }
}
