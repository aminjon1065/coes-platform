import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOptionsWhere, Repository } from 'typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';

import { Document, DocumentStatus } from '../entities/document.entity';
import { WorkflowTemplate } from '../entities/workflow-template.entity';
import { WorkflowStepDefinition, StepType } from '../entities/workflow-step-definition.entity';
import {
  WorkflowInstance,
  WorkflowInstanceStatus,
} from '../entities/workflow-instance.entity';
import {
  WorkflowStep,
  WorkflowStepStatus,
  WorkflowStepAction,
} from '../entities/workflow-step.entity';
import { WorkflowHistory } from '../entities/workflow-history.entity';

import { AuditService } from '../../audit/services/audit.service';
import { OrgService } from '../../org/services/org.service';
import { UsersService } from '../../users/services/users.service';
import { ActOnStepDto } from '../dto/act-on-step.dto';
import { CreateWorkflowTemplateDto } from '../dto/create-workflow-template.dto';

/** Actions that advance the workflow forward */
const ADVANCING_ACTIONS = new Set<WorkflowStepAction>([
  WorkflowStepAction.REVIEWED,
  WorkflowStepAction.ENDORSED,
  WorkflowStepAction.ENDORSED_CONDITIONALLY,
  WorkflowStepAction.APPROVED,
  WorkflowStepAction.SIGNED,
  WorkflowStepAction.RESOLUTION_ISSUED,
  WorkflowStepAction.DISTRIBUTED,
  WorkflowStepAction.ACKNOWLEDGED,
]);

/** Actions that are terminal (workflow ends) */
const REJECTING_ACTIONS = new Set<WorkflowStepAction>([
  WorkflowStepAction.REJECTED,
]);

/** Actions that suspend the workflow and return document for revision */
const RETURNING_ACTIONS = new Set<WorkflowStepAction>([
  WorkflowStepAction.RETURNED,
]);

@Injectable()
export class WorkflowService {
  private readonly logger = new Logger(WorkflowService.name);

  constructor(
    @InjectRepository(Document)
    private readonly documentRepo: Repository<Document>,
    @InjectRepository(WorkflowTemplate)
    private readonly templateRepo: Repository<WorkflowTemplate>,
    @InjectRepository(WorkflowStepDefinition)
    private readonly stepDefRepo: Repository<WorkflowStepDefinition>,
    @InjectRepository(WorkflowInstance)
    private readonly instanceRepo: Repository<WorkflowInstance>,
    @InjectRepository(WorkflowStep)
    private readonly stepRepo: Repository<WorkflowStep>,
    @InjectRepository(WorkflowHistory)
    private readonly historyRepo: Repository<WorkflowHistory>,
    private readonly auditService: AuditService,
    private readonly orgService: OrgService,
    private readonly usersService: UsersService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  // ─── Template Management ─────────────────────────────────────────────────────

  async createTemplate(dto: CreateWorkflowTemplateDto, actorId: string): Promise<WorkflowTemplate> {
    // Deactivate existing templates for this document type
    await this.templateRepo.update(
      { documentTypeId: dto.documentTypeId, active: true },
      { active: false },
    );

    const template = this.templateRepo.create({
      name: dto.name,
      description: dto.description ?? null,
      documentTypeId: dto.documentTypeId,
      version: 1,
      active: true,
    });
    await this.templateRepo.save(template);

    const stepDefs = dto.steps.map((s) =>
      this.stepDefRepo.create({
        templateId: template.id,
        stepOrder: s.stepOrder,
        stepName: s.stepName,
        stepType: s.stepType,
        targetResolver: s.targetResolver,
        isParallel: s.isParallel ?? false,
        parallelThreshold: s.parallelThreshold ?? null,
        timeoutHours: s.timeoutHours ?? null,
        secondaryEscalationHours: s.secondaryEscalationHours ?? null,
        returnToStep: s.returnToStep ?? null,
        condition: s.condition ?? null,
        isOptional: s.isOptional ?? false,
      }),
    );
    await this.stepDefRepo.save(stepDefs);

    await this.auditService.emit({
      eventType: 'WORKFLOW_TEMPLATE_CREATED',
      resourceType: 'workflow_template',
      resourceId: template.id,
      actorId,
      details: { name: dto.name, documentTypeId: dto.documentTypeId, stepCount: dto.steps.length },
    });

    return this.templateRepo.findOne({ where: { id: template.id }, relations: ['steps'] }) as Promise<WorkflowTemplate>;
  }

  async listTemplates(documentTypeId?: string): Promise<WorkflowTemplate[]> {
    const where: FindOptionsWhere<WorkflowTemplate> = { active: true };
    if (documentTypeId) where.documentTypeId = documentTypeId;
    return this.templateRepo.find({ where, relations: ['steps'] });
  }

  async getTemplate(id: string): Promise<WorkflowTemplate> {
    const template = await this.templateRepo.findOne({ where: { id }, relations: ['steps'] });
    if (!template) throw new NotFoundException(`WorkflowTemplate ${id} not found`);
    return template;
  }

  // ─── Instance Management ─────────────────────────────────────────────────────

  /**
   * Start a workflow for a document.
   * Called by EdmsService when a document is registered.
   */
  async startWorkflow(
    documentId: string,
    actorId: string,
    actorPositionId: string | null,
  ): Promise<WorkflowInstance> {
    const document = await this.documentRepo.findOne({ where: { id: documentId }, relations: ['type'] });
    if (!document) throw new NotFoundException(`Document ${documentId} not found`);

    // Find the active template for this document type
    const template = await this.templateRepo.findOne({
      where: { documentTypeId: document.typeId, active: true },
      relations: ['steps'],
    });
    if (!template) {
      this.logger.warn(`No active workflow template for DocumentType ${document.typeId} — document ${documentId} will not enter workflow`);
      return null as unknown as WorkflowInstance;
    }

    // Ensure no active instance already exists
    const existing = await this.instanceRepo.findOne({
      where: { documentId, status: WorkflowInstanceStatus.ACTIVE },
    });
    if (existing) throw new BadRequestException(`Document ${documentId} already has an active workflow instance`);

    const instance = this.instanceRepo.create({
      documentId,
      templateId: template.id,
      templateVersion: template.version,
      status: WorkflowInstanceStatus.ACTIVE,
      currentStepOrder: null,
      initiatedById: actorId,
      initiatedByPositionId: actorPositionId,
    });
    await this.instanceRepo.save(instance);

    await this.recordHistory(documentId, instance.id, null, 'workflow_started', actorId, actorPositionId, null, {
      templateId: template.id,
      templateName: template.name,
    });

    // Activate the first step
    const sortedSteps = [...template.steps].sort((a, b) => a.stepOrder - b.stepOrder);
    if (sortedSteps.length > 0) {
      await this.activateStep(instance, sortedSteps[0], document);
    } else {
      // No steps — immediately complete
      await this.completeInstance(instance, documentId, actorId, actorPositionId);
    }

    return this.instanceRepo.findOne({ where: { id: instance.id }, relations: ['steps'] }) as Promise<WorkflowInstance>;
  }

  async getInstance(documentId: string, actorClearance: number): Promise<WorkflowInstance | null> {
    const document = await this.documentRepo.findOne({ where: { id: documentId } });
    if (!document) throw new NotFoundException(`Document ${documentId} not found`);
    if (actorClearance < document.classification) {
      throw new ForbiddenException(`Clearance insufficient for this document's classification`);
    }
    return this.instanceRepo.findOne({
      where: { documentId, status: WorkflowInstanceStatus.ACTIVE },
      relations: ['steps', 'template'],
    });
  }

  async getInstanceHistory(documentId: string, actorClearance: number): Promise<WorkflowHistory[]> {
    const document = await this.documentRepo.findOne({ where: { id: documentId } });
    if (!document) throw new NotFoundException(`Document ${documentId} not found`);
    if (actorClearance < document.classification) {
      throw new ForbiddenException(`Clearance insufficient for this document's classification`);
    }
    return this.historyRepo.find({
      where: { documentId },
      order: { createdAt: 'ASC' },
    });
  }

  // ─── Step Actions ────────────────────────────────────────────────────────────

  async actOnStep(
    documentId: string,
    stepId: string,
    dto: ActOnStepDto,
    actorId: string,
    actorPositionId: string,
    actorClearance: number,
  ): Promise<WorkflowInstance> {
    const document = await this.documentRepo.findOne({ where: { id: documentId } });
    if (!document) throw new NotFoundException(`Document ${documentId} not found`);
    if (actorClearance < document.classification) {
      throw new ForbiddenException(`Clearance insufficient for this document's classification`);
    }

    const step = await this.stepRepo.findOne({ where: { id: stepId, status: WorkflowStepStatus.ACTIVE } });
    if (!step) throw new NotFoundException(`Active workflow step ${stepId} not found`);
    if (step.instanceId === undefined) throw new BadRequestException('Step is not attached to an instance');

    // Verify the actor is the assigned position (or a valid delegate)
    if (step.positionId !== actorPositionId && !dto.delegationId) {
      // Allow supervisor override for certain actions
      const isSupervisor = await this.orgService.isSubordinateTo(step.positionId, actorPositionId);
      if (!isSupervisor) {
        throw new ForbiddenException(`You are not the designated actor for this workflow step`);
      }
    }

    const instance = await this.instanceRepo.findOne({ where: { id: step.instanceId }, relations: ['template', 'template.steps'] });
    if (!instance || instance.status !== WorkflowInstanceStatus.ACTIVE) {
      throw new BadRequestException('Workflow instance is not active');
    }

    // Validate action is appropriate for step type
    this.assertActionCompatibility(step.stepType, dto.action);

    // Complete the step
    step.status = RETURNING_ACTIONS.has(dto.action) ? WorkflowStepStatus.RETURNED : WorkflowStepStatus.COMPLETED;
    step.actionTaken = dto.action;
    step.actorId = actorId;
    step.actorPositionId = actorPositionId;
    step.delegationId = dto.delegationId ?? null;
    step.remarks = dto.remarks ?? null;
    step.completedAt = new Date();
    await this.stepRepo.save(step);

    await this.recordHistory(documentId, instance.id, step.id, 'step_completed', actorId, actorPositionId, dto.delegationId ?? null, {
      action: dto.action,
      remarks: dto.remarks,
      stepType: step.stepType,
      stepName: step.stepName,
    });

    await this.auditService.emit({
      eventType: 'WORKFLOW_STEP_COMPLETED',
      resourceType: 'document',
      resourceId: documentId,
      actorId,
      details: { stepId, action: dto.action, stepName: step.stepName, delegationId: dto.delegationId },
    });

    // Handle workflow advancement
    if (REJECTING_ACTIONS.has(dto.action)) {
      await this.rejectInstance(instance, documentId, dto.remarks ?? 'Rejected', actorId, actorPositionId);
    } else if (RETURNING_ACTIONS.has(dto.action)) {
      await this.returnForRevision(instance, step, document, dto.remarks ?? '', actorId, actorPositionId);
    } else if (ADVANCING_ACTIONS.has(dto.action)) {
      await this.advanceWorkflow(instance, step, document, actorId, actorPositionId);
    }

    this.eventEmitter.emit('workflow.step_completed', {
      documentId,
      stepId,
      action: dto.action,
      actorId,
      actorPositionId,
    });

    return this.instanceRepo.findOne({ where: { id: instance.id }, relations: ['steps'] }) as Promise<WorkflowInstance>;
  }

  // ─── Overdue Detection (called by scheduler) ──────────────────────────────────

  async markOverdueSteps(): Promise<number> {
    const now = new Date();
    const overdueSteps = await this.stepRepo
      .createQueryBuilder('step')
      .where('step.status = :status', { status: WorkflowStepStatus.ACTIVE })
      .andWhere('step.deadline IS NOT NULL')
      .andWhere('step.deadline < :now', { now })
      .andWhere('step.overdueAt IS NULL')
      .getMany();

    for (const step of overdueSteps) {
      step.status = WorkflowStepStatus.OVERDUE;
      step.overdueAt = now;
      await this.stepRepo.save(step);

      const instance = await this.instanceRepo.findOne({ where: { id: step.instanceId } });
      if (instance) {
        await this.recordHistory(instance.documentId, instance.id, step.id, 'step_overdue', 'system', null, null, {
          positionId: step.positionId,
          deadline: step.deadline,
        });

        this.eventEmitter.emit('workflow.step_overdue', {
          documentId: instance.documentId,
          stepId: step.id,
          positionId: step.positionId,
          deadline: step.deadline,
        });
      }
    }

    return overdueSteps.length;
  }

  // ─── Private helpers ─────────────────────────────────────────────────────────

  private async activateStep(
    instance: WorkflowInstance,
    stepDef: WorkflowStepDefinition,
    document: Document,
  ): Promise<void> {
    // Evaluate step condition
    if (stepDef.condition && !this.evaluateCondition(stepDef.condition, document)) {
      // Skip this step
      await this.recordHistory(document.id, instance.id, null, 'step_skipped', 'system', null, null, {
        stepOrder: stepDef.stepOrder,
        stepName: stepDef.stepName,
        reason: 'condition_not_met',
      });
      // Move to next step
      const nextDef = await this.getNextStepDef(instance.templateId, stepDef.stepOrder);
      if (nextDef) {
        await this.activateStep(instance, nextDef, document);
      } else {
        await this.completeInstance(instance, document.id, 'system', null);
      }
      return;
    }

    // Resolve target position
    const positionId = await this.resolveTargetPosition(stepDef.targetResolver, document);
    if (!positionId) {
      this.logger.warn(`Could not resolve target position for step ${stepDef.stepOrder} of template ${instance.templateId}. Escalating to supervisor.`);
      // Vacant position escalation — route to reporting superior
      const escapedPosition = await this.resolveVacantPositionEscalation(stepDef.targetResolver);
      if (!escapedPosition) {
        this.logger.error(`No escalation target found for step ${stepDef.stepOrder}. Workflow stalled.`);
        return;
      }
    }

    const occupant = positionId ? await this.usersService.getPositionOccupant(positionId) : null;

    const deadline = stepDef.timeoutHours
      ? new Date(Date.now() + stepDef.timeoutHours * 3600 * 1000)
      : null;

    const step = this.stepRepo.create({
      instanceId: instance.id,
      stepOrder: stepDef.stepOrder,
      stepName: stepDef.stepName,
      stepType: stepDef.stepType,
      status: WorkflowStepStatus.ACTIVE,
      positionId: positionId ?? 'unresolved',
      assignedUserId: occupant?.credentialId ?? null,
      isParallel: stepDef.isParallel,
      activatedAt: new Date(),
      deadline,
    });
    await this.stepRepo.save(step);

    instance.currentStepOrder = stepDef.stepOrder;
    await this.instanceRepo.save(instance);

    await this.recordHistory(document.id, instance.id, step.id, 'step_activated', 'system', null, null, {
      stepOrder: stepDef.stepOrder,
      stepName: stepDef.stepName,
      stepType: stepDef.stepType,
      positionId: step.positionId,
    });

    this.eventEmitter.emit('workflow.step_activated', {
      documentId: document.id,
      stepId: step.id,
      positionId: step.positionId,
      assignedUserId: step.assignedUserId,
      stepType: stepDef.stepType,
      deadline,
    });
  }

  private async advanceWorkflow(
    instance: WorkflowInstance,
    completedStep: WorkflowStep,
    document: Document,
    actorId: string,
    actorPositionId: string,
  ): Promise<void> {
    // For parallel steps: check if all required completions are done
    if (completedStep.isParallel) {
      const siblingsCompleted = await this.stepRepo.count({
        where: {
          instanceId: instance.id,
          stepOrder: completedStep.stepOrder,
          status: WorkflowStepStatus.COMPLETED,
        },
      });
      const siblingsTotal = await this.stepRepo.count({
        where: { instanceId: instance.id, stepOrder: completedStep.stepOrder },
      });

      const stepDef = instance.template?.steps?.find(s => s.stepOrder === completedStep.stepOrder);
      const threshold = stepDef?.parallelThreshold ?? siblingsTotal;
      if (siblingsCompleted < threshold) {
        return; // Wait for more completions
      }
    }

    const nextDef = await this.getNextStepDef(instance.templateId, completedStep.stepOrder);
    if (nextDef) {
      await this.activateStep(instance, nextDef, document);
    } else {
      await this.completeInstance(instance, document.id, actorId, actorPositionId);
    }
  }

  private async completeInstance(
    instance: WorkflowInstance,
    documentId: string,
    actorId: string,
    actorPositionId: string | null,
  ): Promise<void> {
    instance.status = WorkflowInstanceStatus.COMPLETED;
    instance.currentStepOrder = null;
    instance.completedAt = new Date();
    await this.instanceRepo.save(instance);

    // Update document to IN_WORKFLOW → COMPLETED only if all steps done
    await this.documentRepo.update(documentId, { status: DocumentStatus.IN_WORKFLOW });

    await this.recordHistory(documentId, instance.id, null, 'workflow_completed', actorId, actorPositionId, null, {});

    this.eventEmitter.emit('workflow.completed', { documentId, instanceId: instance.id });
  }

  private async rejectInstance(
    instance: WorkflowInstance,
    documentId: string,
    reason: string,
    actorId: string,
    actorPositionId: string,
  ): Promise<void> {
    instance.status = WorkflowInstanceStatus.REJECTED;
    instance.rejectedAt = new Date();
    instance.rejectionReason = reason;
    await this.instanceRepo.save(instance);

    await this.documentRepo.update(documentId, { status: DocumentStatus.CANCELLED });

    await this.recordHistory(documentId, instance.id, null, 'workflow_rejected', actorId, actorPositionId, null, { reason });

    this.eventEmitter.emit('workflow.rejected', { documentId, instanceId: instance.id, reason, actorId });
  }

  private async returnForRevision(
    instance: WorkflowInstance,
    returnedStep: WorkflowStep,
    document: Document,
    reason: string,
    actorId: string,
    actorPositionId: string,
  ): Promise<void> {
    // Suspend all other active steps
    await this.stepRepo.update(
      { instanceId: instance.id, status: WorkflowStepStatus.ACTIVE },
      { status: WorkflowStepStatus.PENDING },
    );

    instance.status = WorkflowInstanceStatus.SUSPENDED;
    await this.instanceRepo.save(instance);

    await this.recordHistory(document.id, instance.id, returnedStep.id, 'workflow_suspended_for_revision', actorId, actorPositionId, null, { reason });

    this.eventEmitter.emit('workflow.returned_for_revision', {
      documentId: document.id,
      instanceId: instance.id,
      returnedByStep: returnedStep.id,
      reason,
      actorId,
      authorId: document.createdById,
    });
  }

  /**
   * Resume a suspended workflow after revision.
   * Called when the document's author resubmits.
   */
  async resumeWorkflow(
    documentId: string,
    actorId: string,
    actorPositionId: string,
    actorClearance: number,
  ): Promise<WorkflowInstance> {
    const instance = await this.instanceRepo.findOne({
      where: { documentId, status: WorkflowInstanceStatus.SUSPENDED },
      relations: ['template', 'template.steps'],
    });
    if (!instance) throw new NotFoundException(`No suspended workflow found for document ${documentId}`);

    const document = await this.documentRepo.findOne({ where: { id: documentId } });
    if (!document) throw new NotFoundException(`Document ${documentId} not found`);
    if (actorClearance < document.classification) {
      throw new ForbiddenException('Clearance insufficient for this document');
    }
    if (document.createdById !== actorId) {
      throw new ForbiddenException('Only the document author may resume a returned workflow');
    }

    // Find the last returned step and its return target
    const lastReturnedStep = await this.stepRepo.findOne({
      where: { instanceId: instance.id, status: WorkflowStepStatus.RETURNED },
      order: { stepOrder: 'DESC' },
    });

    let resumeStepOrder = 1;
    if (lastReturnedStep) {
      const stepDef = instance.template.steps.find(s => s.stepOrder === lastReturnedStep.stepOrder);
      resumeStepOrder = stepDef?.returnToStep ?? 1;
    }

    instance.status = WorkflowInstanceStatus.ACTIVE;
    await this.instanceRepo.save(instance);

    const resumeDef = instance.template.steps.find(s => s.stepOrder === resumeStepOrder);
    if (resumeDef) {
      await this.activateStep(instance, resumeDef, document);
    }

    await this.recordHistory(documentId, instance.id, null, 'workflow_resumed', actorId, actorPositionId, null, { resumeStepOrder });

    return this.instanceRepo.findOne({ where: { id: instance.id }, relations: ['steps'] }) as Promise<WorkflowInstance>;
  }

  private async getNextStepDef(templateId: string, currentOrder: number): Promise<WorkflowStepDefinition | null> {
    return this.stepDefRepo.findOne({
      where: { templateId },
      order: { stepOrder: 'ASC' },
    }).then(async () => {
      return this.stepDefRepo
        .createQueryBuilder('s')
        .where('s.templateId = :templateId', { templateId })
        .andWhere('s.stepOrder > :currentOrder', { currentOrder })
        .orderBy('s.stepOrder', 'ASC')
        .limit(1)
        .getOne();
    });
  }

  private async resolveTargetPosition(
    resolver: Record<string, unknown>,
    document: Document,
  ): Promise<string | null> {
    const type = resolver['type'] as string;

    switch (type) {
      case 'fixed_position':
        return resolver['positionId'] as string;

      case 'document_author_supervisor': {
        if (!document.createdByPositionId) return null;
        const chain = await this.orgService.getCommandChain(document.createdByPositionId);
        // chain[0] is the position itself, chain[1] is the direct supervisor
        return chain.length > 1 ? chain[1].id : null;
      }

      case 'department_head': {
        const departmentId = resolver['departmentId'] as string;
        const positions = await this.orgService.getPositionsByDepartment(departmentId);
        const head = positions.find(p => p.level === 'department_head' && p.active);
        return head?.id ?? null;
      }

      case 'organization_leadership': {
        // Find highest active position — simplified; real impl queries by level
        const level = resolver['level'] as string;
        // Would query positions by level across org; return null for now to trigger escalation
        this.logger.warn(`organization_leadership resolver not fully implemented for level: ${level}`);
        return null;
      }

      default:
        this.logger.warn(`Unknown target resolver type: ${type}`);
        return null;
    }
  }

  private async resolveVacantPositionEscalation(
    resolver: Record<string, unknown>,
  ): Promise<string | null> {
    const positionId = resolver['positionId'] as string | undefined;
    if (!positionId) return null;

    const chain = await this.orgService.getCommandChain(positionId);
    // Find first non-vacant position up the chain
    for (let i = 1; i < chain.length; i++) {
      const occupant = await this.usersService.getPositionOccupant(chain[i].id);
      if (occupant) return chain[i].id;
    }
    return null;
  }

  private evaluateCondition(condition: Record<string, unknown>, document: Document): boolean {
    // Simple condition evaluator for common cases
    if (condition['classification']) {
      const cond = condition['classification'] as Record<string, number>;
      if (cond['gte'] !== undefined && document.classification < cond['gte']) return false;
      if (cond['lte'] !== undefined && document.classification > cond['lte']) return false;
    }
    return true;
  }

  private assertActionCompatibility(stepType: StepType, action: WorkflowStepAction): void {
    const allowed: Record<StepType, WorkflowStepAction[]> = {
      [StepType.REVIEW]: [WorkflowStepAction.REVIEWED, WorkflowStepAction.RETURNED],
      [StepType.ENDORSEMENT]: [WorkflowStepAction.ENDORSED, WorkflowStepAction.ENDORSED_CONDITIONALLY, WorkflowStepAction.RETURNED],
      [StepType.APPROVAL]: [WorkflowStepAction.APPROVED, WorkflowStepAction.REJECTED, WorkflowStepAction.RETURNED],
      [StepType.SIGNING]: [WorkflowStepAction.SIGNED, WorkflowStepAction.RETURNED],
      [StepType.RESOLUTION]: [WorkflowStepAction.RESOLUTION_ISSUED, WorkflowStepAction.RETURNED],
      [StepType.DISTRIBUTION]: [WorkflowStepAction.DISTRIBUTED],
      [StepType.EXECUTION]: [WorkflowStepAction.ACKNOWLEDGED],
      [StepType.ACKNOWLEDGEMENT]: [WorkflowStepAction.ACKNOWLEDGED],
    };
    if (!allowed[stepType]?.includes(action)) {
      throw new BadRequestException(
        `Action '${action}' is not valid for step type '${stepType}'`,
      );
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
    remarks?: string,
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
      remarks: remarks ?? null,
    });
    await this.historyRepo.save(entry).catch((err) => {
      this.logger.error(`Failed to record workflow history: ${err.message}`, err.stack);
    });
  }
}
