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
import { DeadlineExtensionRequest, DeadlineExtensionStatus } from '../entities/deadline-extension-request.entity';
import { WorkflowHistory } from '../entities/workflow-history.entity';
import { WorkflowStep, WorkflowStepStatus } from '../entities/workflow-step.entity';

import { AuditService } from '../../audit/services/audit.service';
import { OrgService } from '../../org/services/org.service';
import { UsersService } from '../../users/services/users.service';
import { OutboxService } from '../../outbox/services/outbox.service';

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
    @InjectRepository(DeadlineExtensionRequest)
    private readonly extensionRepo: Repository<DeadlineExtensionRequest>,
    @InjectRepository(WorkflowHistory)
    private readonly historyRepo: Repository<WorkflowHistory>,
    @InjectRepository(WorkflowStep)
    private readonly stepRepo: Repository<WorkflowStep>,
    private readonly auditService: AuditService,
    private readonly orgService: OrgService,
    private readonly usersService: UsersService,
    private readonly eventEmitter: EventEmitter2,
    private readonly outboxService: OutboxService,
  ) {}

  // ─── Issue Resolution ────────────────────────────────────────────────────────

  async issueResolution(
    documentId: string,
    dto: IssueResolutionDto,
    actorId: string,
    actorPositionId: string,
    actorClearance: number,
  ): Promise<Resolution> {
    const document = await this.getAccessibleDocument(
      documentId,
      actorId,
      actorPositionId,
      actorClearance,
    );
    this.assertDocumentVisibility(document, actorId, actorPositionId);

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
    await this.outboxService.publish(
      'edms.resolution_issued',
      {
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
      },
      {
        source: 'edms',
        aggregateType: 'document',
        aggregateId: documentId,
      },
    );

    return this.resolutionRepo.findOne({
      where: { id: resolution.id },
      relations: ['executorAssignments'],
    }) as Promise<Resolution>;
  }

  async getResolutions(
    documentId: string,
    actorId: string,
    actorPositionId: string | null,
    actorClearance: number,
  ): Promise<Resolution[]> {
    const document = await this.getAccessibleDocument(
      documentId,
      actorId,
      actorPositionId,
      actorClearance,
    );
    if (actorPositionId && !(await this.canAccessResolutionData(document, actorId, actorPositionId))) {
      throw new ForbiddenException('You do not have access to this document resolutions');
    }
    if (!actorPositionId && document.createdById !== actorId) {
      throw new ForbiddenException('You do not have access to this document resolutions');
    }
    return this.resolutionRepo.find({
      where: { documentId },
      relations: ['executorAssignments'],
      order: { createdAt: 'ASC' },
    });
  }

  async getExecutorAssignments(
    documentId: string,
    actorId: string,
    actorPositionId: string | null,
    actorClearance: number,
  ): Promise<ExecutorAssignment[]> {
    const document = await this.getAccessibleDocument(
      documentId,
      actorId,
      actorPositionId,
      actorClearance,
    );
    if (actorPositionId && !(await this.canAccessResolutionData(document, actorId, actorPositionId))) {
      throw new ForbiddenException('You do not have access to this document executor assignments');
    }
    if (!actorPositionId && document.createdById !== actorId) {
      throw new ForbiddenException('You do not have access to this document executor assignments');
    }
    return this.assignmentRepo.find({ where: { documentId }, order: { createdAt: 'ASC' } });
  }

  private async getAccessibleDocument(
    documentId: string,
    actorId: string,
    actorPositionId: string | null,
    actorClearance: number,
  ): Promise<Document> {
    const document = await this.documentRepo.findOne({ where: { id: documentId } });
    if (!document) throw new NotFoundException(`Document ${documentId} not found`);
    if (actorClearance < document.classification) {
      throw new ForbiddenException('Clearance insufficient');
    }
    return document;
  }

  private assertDocumentVisibility(
    document: Document,
    actorId: string,
    actorPositionId: string | null,
  ): void {
    if (!this.hasDocumentVisibility(document, actorId, actorPositionId)) {
      throw new ForbiddenException('You do not have access to this document');
    }
  }

  private hasDocumentVisibility(
    document: Document,
    actorId: string,
    actorPositionId: string | null,
  ): boolean {
    const isRecipient = actorPositionId
      ? document.recipients.some((recipient) => recipient.positionId === actorPositionId)
      : false;

    return (
      document.createdById === actorId ||
      (!!actorPositionId &&
        (document.createdByPositionId === actorPositionId ||
          document.senderPositionId === actorPositionId ||
          isRecipient))
    );
  }

  private assertDocumentAllowsCompletion(document: Document): void {
    if (
      document.status === DocumentStatus.DRAFT ||
      document.status === DocumentStatus.CANCELLED ||
      document.status === DocumentStatus.ARCHIVED
    ) {
      throw new BadRequestException(
        `Cannot complete executor assignment for document with status '${document.status}'`,
      );
    }
  }

  private assertAssignmentCanBeCompleted(assignment: ExecutorAssignment): void {
    if (assignment.status === ExecutorAssignmentStatus.COMPLETED) {
      throw new BadRequestException('Assignment is already completed');
    }
    if (
      assignment.status === ExecutorAssignmentStatus.CANCELLED ||
      assignment.status === ExecutorAssignmentStatus.RETURNED
    ) {
      throw new BadRequestException(
        `Cannot complete executor assignment in status '${assignment.status}'`,
      );
    }
  }

  private async canAccessResolutionData(
    document: Document,
    actorId: string,
    actorPositionId: string,
  ): Promise<boolean> {
    if (this.hasDocumentVisibility(document, actorId, actorPositionId)) {
      return true;
    }

    const assignment = await this.assignmentRepo.findOne({
      where: { documentId: document.id, positionId: actorPositionId },
    });
    return !!assignment;
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

    this.assertAssignmentCanBeCompleted(assignment);

    const document = await this.documentRepo.findOne({ where: { id: assignment.documentId } });
    if (!document) throw new NotFoundException(`Document ${assignment.documentId} not found`);
    this.assertDocumentAllowsCompletion(document);

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

  // ─── Acceptance & Progress Flow (§9.3) ───────────────────────────────────────

  /**
   * Formally accept an executor assignment. Transitions ASSIGNED → ACCEPTED.
   * Must be called by the assigned position's occupant.
   * Non-acceptance triggers escalation (handled by scheduler, not here). §9.3
   */
  async acceptAssignment(
    assignmentId: string,
    actorId: string,
    actorPositionId: string,
  ): Promise<ExecutorAssignment> {
    const assignment = await this.assignmentRepo.findOne({ where: { id: assignmentId } });
    if (!assignment) throw new NotFoundException(`ExecutorAssignment ${assignmentId} not found`);

    if (assignment.positionId !== actorPositionId) {
      throw new ForbiddenException('Only the assigned position occupant may accept this assignment');
    }
    if (assignment.status !== ExecutorAssignmentStatus.ASSIGNED) {
      throw new BadRequestException(`Assignment cannot be accepted in status '${assignment.status}'`);
    }

    assignment.status = ExecutorAssignmentStatus.ACCEPTED;
    await this.assignmentRepo.save(assignment);

    await this.recordHistory(assignment.documentId, null, null, 'executor_assignment_accepted', actorId, actorPositionId, null, { assignmentId });
    await this.auditService.emit({
      eventType: 'EDMS_EXECUTOR_ACCEPTED',
      resourceType: 'document',
      resourceId: assignment.documentId,
      actorId,
      details: { assignmentId },
    });

    return assignment;
  }

  /**
   * Update assignment status to IN_PROGRESS. Transitions ACCEPTED → IN_PROGRESS.
   * Executor signals they have started active work. §9.5
   */
  async markAssignmentInProgress(
    assignmentId: string,
    actorId: string,
    actorPositionId: string,
  ): Promise<ExecutorAssignment> {
    const assignment = await this.assignmentRepo.findOne({ where: { id: assignmentId } });
    if (!assignment) throw new NotFoundException(`ExecutorAssignment ${assignmentId} not found`);

    if (assignment.positionId !== actorPositionId) {
      throw new ForbiddenException('Only the assigned position occupant may update progress');
    }
    if (assignment.status !== ExecutorAssignmentStatus.ACCEPTED) {
      throw new BadRequestException(`Assignment must be ACCEPTED before marking in-progress, current status: '${assignment.status}'`);
    }

    assignment.status = ExecutorAssignmentStatus.IN_PROGRESS;
    await this.assignmentRepo.save(assignment);

    await this.recordHistory(assignment.documentId, null, null, 'executor_assignment_in_progress', actorId, actorPositionId, null, { assignmentId });

    return assignment;
  }

  /**
   * Create a sub-assignment under an existing PRIMARY assignment. §9.4
   * The primary executor distributes work to a subordinate position.
   * Sub-delegation is one level deep; returns the sub-assignment record.
   */
  async createSubAssignment(
    parentAssignmentId: string,
    dto: { positionId: string; instruction?: string; deadline?: string },
    actorId: string,
    actorPositionId: string,
  ): Promise<ExecutorAssignment> {
    const parent = await this.assignmentRepo.findOne({ where: { id: parentAssignmentId } });
    if (!parent) throw new NotFoundException(`Parent assignment ${parentAssignmentId} not found`);

    if (parent.positionId !== actorPositionId) {
      throw new ForbiddenException('Only the primary executor may create sub-assignments');
    }
    if (parent.executorRole !== ExecutorRole.PRIMARY) {
      throw new BadRequestException('Sub-assignments can only be created from PRIMARY assignments');
    }
    if (parent.parentAssignmentId) {
      throw new BadRequestException('Sub-assignments cannot be further sub-delegated (max 1 level)');
    }
    if ([ExecutorAssignmentStatus.COMPLETED, ExecutorAssignmentStatus.CANCELLED].includes(parent.status)) {
      throw new BadRequestException(`Cannot sub-assign a ${parent.status} assignment`);
    }

    // Verify subordinate authority
    const isSubordinate = await this.orgService.isSubordinateTo(dto.positionId, actorPositionId);
    if (!isSubordinate) {
      throw new ForbiddenException('Sub-assignment target must be a subordinate position in your command chain');
    }

    const occupant = await this.usersService.getPositionOccupant(dto.positionId);
    const sub = this.assignmentRepo.create({
      resolutionId: parent.resolutionId,
      documentId: parent.documentId,
      positionId: dto.positionId,
      assignedUserId: occupant?.credentialId ?? null,
      executorRole: ExecutorRole.CO_EXECUTOR,
      instruction: dto.instruction ?? null,
      deadline: dto.deadline ?? parent.deadline,
      status: ExecutorAssignmentStatus.ASSIGNED,
      parentAssignmentId: parent.id,
    });
    await this.assignmentRepo.save(sub);

    await this.recordHistory(parent.documentId, null, null, 'sub_assignment_created', actorId, actorPositionId, null, {
      parentAssignmentId: parent.id,
      subAssignmentId: sub.id,
      targetPositionId: dto.positionId,
    });
    await this.auditService.emit({
      eventType: 'EDMS_SUB_ASSIGNMENT_CREATED',
      resourceType: 'document',
      resourceId: parent.documentId,
      actorId,
      details: { parentAssignmentId: parent.id, subAssignmentId: sub.id, targetPositionId: dto.positionId },
    });

    // Notify TaskManagement to create a task for the sub-assignment
    await this.outboxService.publish(
      'edms.sub_assignment_created',
      {
        documentId: parent.documentId,
        resolutionId: parent.resolutionId,
        parentAssignmentId: parent.id,
        subAssignmentId: sub.id,
        positionId: sub.positionId,
        assignedUserId: sub.assignedUserId,
        instruction: sub.instruction,
        deadline: sub.deadline,
      },
      { source: 'edms', aggregateType: 'document', aggregateId: parent.documentId },
    );

    return sub;
  }

  // ─── Deadline Extension Requests (§9.6) ───────────────────────────────────────

  /**
   * File a formal deadline extension request for an executor assignment. §9.6
   * The requesting executor must supply a justification.
   * Only the assigned executor (or their position occupant) may request extension.
   */
  async requestDeadlineExtension(
    assignmentId: string,
    dto: { requestedDeadline: string; justification: string },
    actorId: string,
    actorPositionId: string,
  ): Promise<DeadlineExtensionRequest> {
    const assignment = await this.assignmentRepo.findOne({ where: { id: assignmentId } });
    if (!assignment) throw new NotFoundException(`ExecutorAssignment ${assignmentId} not found`);

    if (assignment.positionId !== actorPositionId) {
      throw new ForbiddenException('Only the assigned executor may request a deadline extension');
    }
    if ([ExecutorAssignmentStatus.COMPLETED, ExecutorAssignmentStatus.CANCELLED].includes(assignment.status)) {
      throw new BadRequestException(`Cannot request extension for a ${assignment.status} assignment`);
    }
    if (!assignment.deadline) {
      throw new BadRequestException('Assignment has no deadline to extend');
    }

    const requestedDate = new Date(dto.requestedDeadline);
    const currentDate = new Date(assignment.deadline);
    if (requestedDate <= currentDate) {
      throw new BadRequestException('Requested deadline must be later than the current deadline');
    }

    // Only one pending extension at a time
    const existing = await this.extensionRepo.findOne({
      where: { assignmentId, status: DeadlineExtensionStatus.PENDING },
    });
    if (existing) {
      throw new BadRequestException('There is already a pending deadline extension request for this assignment');
    }

    const request = this.extensionRepo.create({
      assignmentId,
      documentId: assignment.documentId,
      requesterPositionId: actorPositionId,
      requesterId: actorId,
      currentDeadline: assignment.deadline,
      requestedDeadline: dto.requestedDeadline,
      justification: dto.justification,
      status: DeadlineExtensionStatus.PENDING,
    });
    await this.extensionRepo.save(request);

    await this.recordHistory(assignment.documentId, null, null, 'deadline_extension_requested', actorId, actorPositionId, null, {
      assignmentId,
      extensionRequestId: request.id,
      currentDeadline: request.currentDeadline,
      requestedDeadline: request.requestedDeadline,
    });

    this.eventEmitter.emit('edms.deadline_extension_requested', {
      documentId: assignment.documentId,
      assignmentId,
      extensionRequestId: request.id,
      requesterPositionId: actorPositionId,
    });

    return request;
  }

  /**
   * Approve a deadline extension request. The assignment deadline is updated. §9.6
   * Must be called by the resolution-issuing authority or their superior.
   */
  async approveDeadlineExtension(
    extensionRequestId: string,
    remarks: string | undefined,
    actorId: string,
    actorPositionId: string,
  ): Promise<DeadlineExtensionRequest> {
    const request = await this.extensionRepo.findOne({ where: { id: extensionRequestId } });
    if (!request) throw new NotFoundException(`DeadlineExtensionRequest ${extensionRequestId} not found`);
    if (request.status !== DeadlineExtensionStatus.PENDING) {
      throw new BadRequestException(`Extension request is already ${request.status}`);
    }

    // Verify that actor has authority over the assigning position (via resolution)
    const assignment = await this.assignmentRepo.findOne({ where: { id: request.assignmentId } });
    if (!assignment) throw new NotFoundException(`Assignment ${request.assignmentId} not found`);
    const resolution = await this.resolutionRepo.findOne({ where: { id: assignment.resolutionId } });
    if (!resolution) throw new NotFoundException(`Resolution not found`);

    const hasAuthority =
      actorPositionId === resolution.issuingPositionId ||
      (await this.orgService.isSubordinateTo(resolution.issuingPositionId, actorPositionId));
    if (!hasAuthority) {
      throw new ForbiddenException('Only the resolution-issuing authority or a superior may approve deadline extensions');
    }

    // Update request
    request.status = DeadlineExtensionStatus.APPROVED;
    request.reviewedById = actorId;
    request.reviewedByPositionId = actorPositionId;
    request.reviewRemarks = remarks ?? null;
    request.reviewedAt = new Date();
    await this.extensionRepo.save(request);

    // Apply the new deadline to the assignment
    assignment.deadline = request.requestedDeadline;
    await this.assignmentRepo.save(assignment);

    await this.recordHistory(assignment.documentId, null, null, 'deadline_extension_approved', actorId, actorPositionId, null, {
      extensionRequestId,
      assignmentId: assignment.id,
      newDeadline: request.requestedDeadline,
    });

    this.eventEmitter.emit('edms.deadline_extension_approved', {
      documentId: assignment.documentId,
      assignmentId: assignment.id,
      extensionRequestId,
      newDeadline: request.requestedDeadline,
      requesterPositionId: request.requesterPositionId,
    });

    return request;
  }

  /**
   * Deny a deadline extension request. Assignment deadline is unchanged. §9.6
   * Denial reason (reviewRemarks) is required.
   */
  async denyDeadlineExtension(
    extensionRequestId: string,
    remarks: string,
    actorId: string,
    actorPositionId: string,
  ): Promise<DeadlineExtensionRequest> {
    const request = await this.extensionRepo.findOne({ where: { id: extensionRequestId } });
    if (!request) throw new NotFoundException(`DeadlineExtensionRequest ${extensionRequestId} not found`);
    if (request.status !== DeadlineExtensionStatus.PENDING) {
      throw new BadRequestException(`Extension request is already ${request.status}`);
    }

    const assignment = await this.assignmentRepo.findOne({ where: { id: request.assignmentId } });
    if (!assignment) throw new NotFoundException(`Assignment ${request.assignmentId} not found`);
    const resolution = await this.resolutionRepo.findOne({ where: { id: assignment.resolutionId } });
    if (!resolution) throw new NotFoundException(`Resolution not found`);

    const hasAuthority =
      actorPositionId === resolution.issuingPositionId ||
      (await this.orgService.isSubordinateTo(resolution.issuingPositionId, actorPositionId));
    if (!hasAuthority) {
      throw new ForbiddenException('Only the resolution-issuing authority or a superior may deny deadline extensions');
    }

    request.status = DeadlineExtensionStatus.DENIED;
    request.reviewedById = actorId;
    request.reviewedByPositionId = actorPositionId;
    request.reviewRemarks = remarks;
    request.reviewedAt = new Date();
    await this.extensionRepo.save(request);

    await this.recordHistory(assignment.documentId, null, null, 'deadline_extension_denied', actorId, actorPositionId, null, {
      extensionRequestId,
      assignmentId: assignment.id,
      remarks,
    });

    this.eventEmitter.emit('edms.deadline_extension_denied', {
      documentId: assignment.documentId,
      assignmentId: assignment.id,
      extensionRequestId,
      requesterPositionId: request.requesterPositionId,
    });

    return request;
  }

  /**
   * List deadline extension requests for an assignment (for supervisory monitoring).
   */
  async listDeadlineExtensions(assignmentId: string): Promise<DeadlineExtensionRequest[]> {
    return this.extensionRepo.find({
      where: { assignmentId },
      order: { createdAt: 'DESC' },
    });
  }

  /**
   * Link a Task Management task to this executor assignment.
   * Called by the task.created event listener (Phase 2.2).
   */
  async linkTask(assignmentId: string, taskId: string): Promise<void> {
    const assignment = await this.assignmentRepo.findOne({ where: { id: assignmentId } });
    if (!assignment) throw new NotFoundException(`ExecutorAssignment ${assignmentId} not found`);
    if (assignment.linkedTaskId === taskId) return;
    if (assignment.linkedTaskId) {
      throw new BadRequestException(
        `ExecutorAssignment ${assignmentId} is already linked to task ${assignment.linkedTaskId}`,
      );
    }
    await this.assignmentRepo.update(assignmentId, { linkedTaskId: taskId });
  }

  // ─── Private helpers ─────────────────────────────────────────────────────────

  private async checkAllAssignmentsComplete(documentId: string): Promise<void> {
    const assignments = await this.assignmentRepo.find({
      where: { documentId, executorRole: ExecutorRole.PRIMARY },
    });
    const activeAssignments = assignments.filter(
      (assignment) => assignment.status !== ExecutorAssignmentStatus.CANCELLED,
    );
    const allComplete = activeAssignments.every(
      (assignment) => assignment.status === ExecutorAssignmentStatus.COMPLETED,
    );
    if (allComplete && activeAssignments.length > 0) {
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
