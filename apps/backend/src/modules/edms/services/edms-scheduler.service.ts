import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan, In } from 'typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';

import { WorkflowStep, WorkflowStepStatus } from '../entities/workflow-step.entity';
import { WorkflowStepDefinition } from '../entities/workflow-step-definition.entity';
import { WorkflowInstance } from '../entities/workflow-instance.entity';
import { ExecutorAssignment, ExecutorAssignmentStatus } from '../entities/executor-assignment.entity';
import { WorkflowHistory } from '../entities/workflow-history.entity';

import { EdmsService } from './edms.service';
import { WorkflowService } from './workflow.service';
import { AuditService } from '../../audit/services/audit.service';

/**
 * EDMS scheduler — wires all time-based enforcement tasks to @Cron triggers.
 *
 * Jobs:
 *  1. markOverdueSteps()                 — every 5 min — workflow step deadline monitoring
 *  2. fireSecondaryEscalations()         — every 5 min — second-tier escalation (§7.9)
 *  3. markOverdueAssignments()           — every 15 min — executor assignment overdue detection (§9.9)
 *  4. notifyApproachingDeadlines()       — daily at 08:00 — pre-deadline executor notifications (§9.9)
 *  5. autoArchiveCompletedDocuments()    — daily at 03:00 — automatic archival (§12)
 */
@Injectable()
export class EdmsSchedulerService {
  private readonly logger = new Logger(EdmsSchedulerService.name);

  constructor(
    @InjectRepository(WorkflowStep)
    private readonly stepRepo: Repository<WorkflowStep>,
    @InjectRepository(WorkflowStepDefinition)
    private readonly stepDefRepo: Repository<WorkflowStepDefinition>,
    @InjectRepository(WorkflowInstance)
    private readonly instanceRepo: Repository<WorkflowInstance>,
    @InjectRepository(ExecutorAssignment)
    private readonly assignmentRepo: Repository<ExecutorAssignment>,
    @InjectRepository(WorkflowHistory)
    private readonly historyRepo: Repository<WorkflowHistory>,
    private readonly edmsService: EdmsService,
    private readonly workflowService: WorkflowService,
    private readonly auditService: AuditService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  // ─── 1. Mark overdue workflow steps ───────────────────────────────────────────

  /**
   * Every 5 minutes: mark ACTIVE workflow steps whose deadline has passed as OVERDUE.
   * Emits `workflow.step_overdue` for each newly overdue step (triggers notification).
   * Delegates to WorkflowService.markOverdueSteps() which owns the step logic.
   */
  @Cron(process.env.EDMS_OVERDUE_STEPS_CRON ?? '*/5 * * * *')
  async runMarkOverdueSteps(): Promise<void> {
    try {
      const count = await this.workflowService.markOverdueSteps();
      if (count > 0) {
        this.logger.log(`Marked ${count} workflow step(s) as overdue`);
      }
    } catch (err) {
      this.logger.error(`runMarkOverdueSteps failed: ${(err as Error).message}`, (err as Error).stack);
    }
  }

  // ─── 2. Secondary escalation (§7.9) ───────────────────────────────────────────

  /**
   * Every 5 minutes: fire secondary escalation for OVERDUE steps whose
   * `secondaryEscalationHours` threshold has also been exceeded.
   *
   * Secondary escalation:
   *   - marks `secondaryEscalationFired = true` on the step
   *   - emits `workflow.secondary_escalation` → Notification domain alerts supervisor
   *   - appends a workflow history entry "escalated"
   *
   * §7.9: "If the step remains incomplete after a secondary timeout, the step is
   * escalated to the target's reporting supervisor."
   */
  @Cron(process.env.EDMS_SECONDARY_ESCALATION_CRON ?? '*/5 * * * *')
  async fireSecondaryEscalations(): Promise<void> {
    const now = new Date();
    try {
      // Find OVERDUE steps that haven't fired secondary escalation yet
      const overdueSteps = await this.stepRepo.find({
        where: {
          status: WorkflowStepStatus.OVERDUE,
          secondaryEscalationFired: false,
        },
      });

      let fired = 0;
      for (const step of overdueSteps) {
        // Fetch step definition for secondaryEscalationHours
        const instance = await this.instanceRepo.findOne({ where: { id: step.instanceId } });
        if (!instance) continue;

        const stepDef = await this.stepDefRepo.findOne({
          where: { templateId: instance.templateId, stepOrder: step.stepOrder },
        });
        if (!stepDef?.secondaryEscalationHours) continue;

        if (!step.overdueAt) continue;

        const secondaryThreshold = new Date(
          step.overdueAt.getTime() + stepDef.secondaryEscalationHours * 3_600_000,
        );
        if (now < secondaryThreshold) continue;

        // Fire secondary escalation
        await this.stepRepo.update(step.id, { secondaryEscalationFired: true });

        // Record in workflow history
        await this.historyRepo.save(
          this.historyRepo.create({
            documentId: instance.documentId,
            instanceId: step.instanceId,
            stepId: step.id,
            eventType: 'step_secondary_escalated',
            actorId: null,
            actorPositionId: null,
            delegationId: null,
            payload: {
              positionId: step.positionId,
              overdueAt: step.overdueAt,
              secondaryFiredAt: now,
            },
          }),
        );

        // Emit for Notification domain to alert supervisor
        this.eventEmitter.emit('workflow.secondary_escalation', {
          documentId: instance.documentId,
          instanceId: instance.id,
          stepId: step.id,
          positionId: step.positionId,
          stepName: step.stepName,
          overdueAt: step.overdueAt,
        });

        fired++;
      }

      if (fired > 0) {
        this.logger.log(`Fired ${fired} secondary escalation(s)`);
      }
    } catch (err) {
      this.logger.error(`fireSecondaryEscalations failed: ${(err as Error).message}`, (err as Error).stack);
    }
  }

  // ─── 3. Mark overdue executor assignments (§9.9) ──────────────────────────────

  /**
   * Every 15 minutes: mark ACTIVE executor assignments (ASSIGNED/ACCEPTED/IN_PROGRESS)
   * whose deadline has passed as OVERDUE.
   * Emits `edms.assignment_overdue` for each newly overdue assignment.
   */
  @Cron(process.env.EDMS_OVERDUE_ASSIGNMENTS_CRON ?? '*/15 * * * *')
  async markOverdueAssignments(): Promise<void> {
    const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    try {
      const activeStatuses = [
        ExecutorAssignmentStatus.ASSIGNED,
        ExecutorAssignmentStatus.ACCEPTED,
        ExecutorAssignmentStatus.IN_PROGRESS,
      ];

      const overdueAssignments = await this.assignmentRepo
        .createQueryBuilder('ea')
        .where('ea.status IN (:...statuses)', { statuses: activeStatuses })
        .andWhere('ea.deadline IS NOT NULL')
        .andWhere('ea.deadline < :today', { today })
        .getMany();

      if (!overdueAssignments.length) return;

      const ids = overdueAssignments.map((a) => a.id);
      await this.assignmentRepo.update({ id: In(ids) }, { status: ExecutorAssignmentStatus.OVERDUE });

      for (const assignment of overdueAssignments) {
        this.eventEmitter.emit('edms.assignment_overdue', {
          documentId: assignment.documentId,
          assignmentId: assignment.id,
          positionId: assignment.positionId,
          deadline: assignment.deadline,
        });

        // Write history entry
        await this.historyRepo.save(
          this.historyRepo.create({
            documentId: assignment.documentId,
            instanceId: null,
            stepId: null,
            eventType: 'executor_assignment_overdue',
            actorId: null,
            actorPositionId: null,
            delegationId: null,
            payload: { assignmentId: assignment.id, deadline: assignment.deadline },
          }),
        ).catch((err) => {
          this.logger.error(`Failed to record overdue history: ${err.message}`);
        });
      }

      this.logger.log(`Marked ${ids.length} executor assignment(s) as overdue`);
    } catch (err) {
      this.logger.error(`markOverdueAssignments failed: ${(err as Error).message}`, (err as Error).stack);
    }
  }

  // ─── 4. Approaching deadline notifications (§9.9) ─────────────────────────────

  /**
   * Daily at 08:00: emit approaching-deadline notifications for executor assignments
   * due within the configured warning window (default: 2 days).
   * Emits `edms.assignment_deadline_approaching` per assignment.
   */
  @Cron(process.env.EDMS_DEADLINE_WARN_CRON ?? '0 8 * * *')
  async notifyApproachingDeadlines(): Promise<void> {
    const warnDays = Number(process.env.EDMS_DEADLINE_WARN_DAYS ?? 2);
    const now = new Date();
    const horizon = new Date(now.getTime() + warnDays * 86_400_000);
    const todayStr = now.toISOString().slice(0, 10);
    const horizonStr = horizon.toISOString().slice(0, 10);

    try {
      const approaching = await this.assignmentRepo
        .createQueryBuilder('ea')
        .where('ea.status IN (:...statuses)', {
          statuses: [
            ExecutorAssignmentStatus.ASSIGNED,
            ExecutorAssignmentStatus.ACCEPTED,
            ExecutorAssignmentStatus.IN_PROGRESS,
          ],
        })
        .andWhere('ea.deadline IS NOT NULL')
        .andWhere('ea.deadline >= :today', { today: todayStr })
        .andWhere('ea.deadline <= :horizon', { horizon: horizonStr })
        .getMany();

      for (const assignment of approaching) {
        this.eventEmitter.emit('edms.assignment_deadline_approaching', {
          documentId: assignment.documentId,
          assignmentId: assignment.id,
          positionId: assignment.positionId,
          deadline: assignment.deadline,
          daysRemaining: Math.ceil(
            (new Date(assignment.deadline!).getTime() - now.getTime()) / 86_400_000,
          ),
        });
      }

      if (approaching.length > 0) {
        this.logger.log(`Emitted approaching-deadline notifications for ${approaching.length} assignment(s)`);
      }
    } catch (err) {
      this.logger.error(`notifyApproachingDeadlines failed: ${(err as Error).message}`, (err as Error).stack);
    }
  }

  // ─── 5. Auto-archive completed documents (§12) ────────────────────────────────

  /**
   * Daily at 03:00: auto-archive COMPLETED documents older than threshold (default 90 days).
   * Delegates to EdmsService.autoArchiveCompletedDocuments().
   */
  @Cron(process.env.EDMS_AUTO_ARCHIVE_CRON ?? '0 3 * * *')
  async runAutoArchive(): Promise<void> {
    const olderThanDays = Number(process.env.EDMS_AUTO_ARCHIVE_DAYS ?? 90);
    try {
      const count = await this.edmsService.autoArchiveCompletedDocuments(olderThanDays);
      if (count > 0) {
        this.logger.log(`Auto-archived ${count} completed document(s)`);
      }
    } catch (err) {
      this.logger.error(`runAutoArchive failed: ${(err as Error).message}`, (err as Error).stack);
    }
  }
}
