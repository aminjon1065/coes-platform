import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';

import { Document, DocumentStatus } from '../entities/document.entity';
import { Resolution, ResolutionPriority } from '../entities/resolution.entity';
import { ExecutorAssignment, ExecutorAssignmentStatus, ExecutorRole } from '../entities/executor-assignment.entity';
import { WorkflowHistory } from '../entities/workflow-history.entity';
import { WorkflowStep, WorkflowStepStatus } from '../entities/workflow-step.entity';

import { AuditService } from '../../audit/services/audit.service';
import { OrgService } from '../../org/services/org.service';
import { UsersService } from '../../users/services/users.service';

import { IssueResolutionDto } from '../dto/issue-resolution.dto';

@Injectable()
export class ResolutionService {
  private readonly logger = new Logger(ResolutionService.name);

  constructor(
    @InjectRepository(Document)
    private readonly documentRepo: Repository<Document>,
    @InjectRepository(Resolution)
    private readonly resolutionRepo: Repository<Resolution>,
    @InjectRepository(ExecutorAssignment)
    private readonly assignmentRepo: Repository<ExecutorAssignment>,
    @InjectRepository(WorkflowHistory)
    private readonly historyRepo: Repository<WorkflowHistory>,
    @InjectRepository(WorkflowStep)
    private readonly stepRepo: Repository<WorkflowStep>,
    private readonly auditService: AuditService,
    private readonly orgService: OrgService,
    private readonly usersService: UsersService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  // ─── Issue Resolution ────────────────────────────────────────────────────────

  async issueResolution(
    documentId: string,
    dto: IssueResolutionDto,
    actorId: string,
    actorPositionId: string,
    actorClearance: number,
  ): Promise<Resolution> {
    const document = await this.documentRepo.findOne({ where: { id: documentId } });
    if (!document) throw new NotFoundException(`Document ${documentId} not found`);
    if (actorClearance < document.classification) {
      throw new ForbiddenException('Clearance insufficient for this document');
    }

    // Document must be in a workflow state to receive resolutions
    if (document.status === DocumentStatus.DRAFT || document.status === DocumentStatus.CANCELLED || document.status === DocumentStatus.ARCHIVED) {
      throw new BadRequestException(`Cannot issue resolution on document with status '${document.status}'`);
    }

    if (!dto.executors || dto.executors.length === 0) {
      throw new BadRequestException('Resolution must designate at least one executor');
    }

    // Validate command chain authority for each executor
    for (const exec of dto.executors) {
      const isSubordinate = await this.orgService.isSubordinateTo(exec.positionId, actorPositionId);
      const isSelf = exec.positionId === actorPositionId;
      if (!isSubordinate && !isSelf) {
        throw new ForbiddenException(
          `You do not have authority to assign work to position ${exec.positionId}. Resolution assignment follows command chain rules.`,
        );
      }
    }

    const resolution = this.resolutionRepo.create({
      documentId,
      workflowStepId: dto.workflowStepId ?? null,
      issuingPositionId: actorPositionId,
      issuingUserId: actorId,
      text: dto.text,
      priority: dto.priority ?? ResolutionPriority.ROUTINE,
      deadline: dto.deadline ?? null,
    });
    await this.resolutionRepo.save(resolution);

    // Create executor assignments
    const assignments: ExecutorAssignment[] = [];
    for (const execDto of dto.executors) {
      const occupant = await this.usersService.getPositionOccupant(execDto.positionId);
      const assignment = this.assignmentRepo.create({
        resolutionId: resolution.id,
        documentId,
        positionId: execDto.positionId,
        assignedUserId: occupant?.credentialId ?? null,
        executorRole: execDto.role ?? ExecutorRole.PRIMARY,
        instruction: execDto.instruction ?? null,
        deadline: execDto.deadline ?? dto.deadline ?? null,
        status: ExecutorAssignmentStatus.ASSIGNED,
      });
      await this.assignmentRepo.save(assignment);
      assignments.push(assignment);
    }

    // Record workflow history
    await this.recordHistory(documentId, null, dto.workflowStepId ?? null, 'resolution_issued', actorId, actorPositionId, null, {
      resolutionId: resolution.id,
      executorCount: assignments.length,
      priority: resolution.priority,
      deadline: resolution.deadline,
    });

    await this.auditService.emit({
      eventType: 'EDMS_RESOLUTION_ISSUED',
      resourceType: 'document',
      resourceId: documentId,
      actorId,
      details: {
        resolutionId: resolution.id,
        executors: dto.executors.map(e => e.positionId),
        priority: resolution.priority,
      },
    });

    // Publish event to create tasks in TaskManagement domain (Phase 2.2)
    this.eventEmitter.emit('edms.resolution_issued', {
      documentId,
      resolutionId: resolution.id,
      issuingPositionId: actorPositionId,
      issuingUserId: actorId,
      text: resolution.text,
      priority: resolution.priority,
      deadline: resolution.deadline,
      assignments: assignments.map(a => ({
        assignmentId: a.id,
        positionId: a.positionId,
        assignedUserId: a.assignedUserId,
        executorRole: a.executorRole,
        instruction: a.instruction,
        deadline: a.deadline,
      })),
    });

    return this.resolutionRepo.findOne({
      where: { id: resolution.id },
      relations: ['executorAssignments'],
    }) as Promise<Resolution>;
  }

  async getResolutions(documentId: string, actorClearance: number): Promise<Resolution[]> {
    const document = await this.documentRepo.findOne({ where: { id: documentId } });
    if (!document) throw new NotFoundException(`Document ${documentId} not found`);
    if (actorClearance < document.classification) {
      throw new ForbiddenException('Clearance insufficient');
    }
    return this.resolutionRepo.find({
      where: { documentId },
      relations: ['executorAssignments'],
      order: { createdAt: 'ASC' },
    });
  }

  async getExecutorAssignments(documentId: string, actorClearance: number): Promise<ExecutorAssignment[]> {
    const document = await this.documentRepo.findOne({ where: { id: documentId } });
    if (!document) throw new NotFoundException(`Document ${documentId} not found`);
    if (actorClearance < document.classification) {
      throw new ForbiddenException('Clearance insufficient');
    }
    return this.assignmentRepo.find({ where: { documentId }, order: { createdAt: 'ASC' } });
  }

  /**
   * File a completion report on an executor assignment.
   * Called when an executor completes their assigned work.
   */
  async fileCompletionReport(
    assignmentId: string,
    report: string,
    actorId: string,
    actorPositionId: string,
  ): Promise<ExecutorAssignment> {
    const assignment = await this.assignmentRepo.findOne({ where: { id: assignmentId } });
    if (!assignment) throw new NotFoundException(`ExecutorAssignment ${assignmentId} not found`);

    if (assignment.positionId !== actorPositionId) {
      throw new ForbiddenException('Only the assigned executor may file a completion report');
    }

    if (assignment.status === ExecutorAssignmentStatus.COMPLETED) {
      throw new BadRequestException('Assignment is already completed');
    }

    assignment.completionReport = report;
    assignment.status = ExecutorAssignmentStatus.COMPLETED;
    assignment.completedAt = new Date();
    await this.assignmentRepo.save(assignment);

    await this.recordHistory(assignment.documentId, null, null, 'executor_assignment_completed', actorId, actorPositionId, null, {
      assignmentId,
      positionId: actorPositionId,
    });

    await this.auditService.emit({
      eventType: 'EDMS_EXECUTOR_COMPLETED',
      resourceType: 'document',
      resourceId: assignment.documentId,
      actorId,
      details: { assignmentId },
    });

    // Check if all primary assignments are complete → document can transition to COMPLETED
    await this.checkAllAssignmentsComplete(assignment.documentId);

    return assignment;
  }

  /**
   * Link a Task Management task to this executor assignment.
   * Called by the task.created event listener (Phase 2.2).
   */
  async linkTask(assignmentId: string, taskId: string): Promise<void> {
    await this.assignmentRepo.update(assignmentId, { linkedTaskId: taskId });
  }

  // ─── Private helpers ─────────────────────────────────────────────────────────

  private async checkAllAssignmentsComplete(documentId: string): Promise<void> {
    const assignments = await this.assignmentRepo.find({
      where: { documentId, executorRole: ExecutorRole.PRIMARY },
    });
    const allComplete = assignments.every(a => a.status === ExecutorAssignmentStatus.COMPLETED);
    if (allComplete && assignments.length > 0) {
      this.eventEmitter.emit('edms.all_assignments_complete', { documentId });
    }
  }

  private async recordHistory(
    documentId: string,
    instanceId: string | null,
    stepId: string | null,
    eventType: string,
    actorId: string,
    actorPositionId: string | null,
    delegationId: string | null,
    payload: Record<string, unknown>,
  ): Promise<void> {
    const entry = this.historyRepo.create({
      documentId,
      instanceId,
      stepId,
      eventType,
      actorId,
      actorPositionId,
      delegationId,
      payload,
    });
    await this.historyRepo.save(entry).catch((err) => {
      this.logger.error(`Failed to record workflow history: ${err.message}`, err.stack);
    });
  }
}
