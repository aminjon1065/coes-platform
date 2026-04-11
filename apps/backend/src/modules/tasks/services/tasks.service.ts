import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull } from 'typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';

import { Task, TaskStatus, TaskPriority, TaskSource, TASK_TRANSITIONS } from '../entities/task.entity';
import { TaskType } from '../entities/task-type.entity';
import { TaskAssignment, AssignmentType, AssignmentStatus } from '../entities/task-assignment.entity';
import { TaskHistory } from '../entities/task-history.entity';
import { TaskComment } from '../entities/task-comment.entity';
import { TaskAttachment } from '../entities/task-attachment.entity';
import {
  TaskDeadlineExtensionRequest,
  TaskExtensionStatus,
} from '../entities/task-deadline-extension-request.entity';

import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { AuditService } from '../../audit/services/audit.service';
import { OrgService } from '../../org/services/org.service';
import { OutboxService } from '../../outbox/services/outbox.service';

import { CreateTaskDto } from '../dto/create-task.dto';
import { UpdateTaskDto } from '../dto/update-task.dto';
import { ListTasksDto } from '../dto/list-tasks.dto';
import { TransitionTaskStatusDto } from '../dto/transition-task-status.dto';
import { AddExecutorDto } from '../dto/add-executor.dto';
import { AddCommentDto } from '../dto/add-comment.dto';
import { AddAttachmentDto } from '../dto/add-attachment.dto';
import { UpdateProgressDto } from '../dto/update-progress.dto';
import { ReassignTaskDto } from '../dto/reassign-task.dto';

/** Maximum subtask depth (0-indexed, so 3 = 4 levels total) */
const MAX_SUBTASK_DEPTH = 3;

@Injectable()
export class TasksService {
  private readonly logger = new Logger(TasksService.name);

  constructor(
    @InjectRepository(Task)
    private readonly taskRepo: Repository<Task>,
    @InjectRepository(TaskType)
    private readonly typeRepo: Repository<TaskType>,
    @InjectRepository(TaskAssignment)
    private readonly assignmentRepo: Repository<TaskAssignment>,
    @InjectRepository(TaskHistory)
    private readonly historyRepo: Repository<TaskHistory>,
    @InjectRepository(TaskComment)
    private readonly commentRepo: Repository<TaskComment>,
    @InjectRepository(TaskAttachment)
    private readonly attachmentRepo: Repository<TaskAttachment>,
    @InjectRepository(TaskDeadlineExtensionRequest)
    private readonly extensionRepo: Repository<TaskDeadlineExtensionRequest>,
    @InjectDataSource()
    private readonly dataSource: DataSource,
    private readonly auditService: AuditService,
    private readonly orgService: OrgService,
    private readonly eventEmitter: EventEmitter2,
    private readonly outboxService: OutboxService,
  ) {}

  // ─── Create ──────────────────────────────────────────────────────────────────

  async createTask(
    dto: CreateTaskDto,
    actorId: string,
    actorPositionId: string,
  ): Promise<Task> {
    const taskType = await this.typeRepo.findOne({ where: { id: dto.typeId, active: true } });
    if (!taskType) throw new NotFoundException(`TaskType ${dto.typeId} not found`);

    // Validate command chain authority
    await this.assertAssignmentAuthority(actorPositionId, dto.responsiblePositionId);

    // Handle subtask depth
    let depth = 0;
    if (dto.parentTaskId) {
      const parent = await this.taskRepo.findOne({ where: { id: dto.parentTaskId } });
      if (!parent) throw new NotFoundException(`Parent task ${dto.parentTaskId} not found`);
      if (!taskType.supportsSubtasks) {
        throw new BadRequestException(`TaskType '${taskType.name}' does not support subtasks`);
      }
      if (parent.depth >= MAX_SUBTASK_DEPTH) {
        throw new BadRequestException(`Maximum subtask depth of ${MAX_SUBTASK_DEPTH} reached`);
      }
      // Only primary executor or assigning authority may create subtasks
      const isParentPrimaryExecutor = parent.responsiblePositionId === actorPositionId;
      const isAssigningAuthority = parent.assigningPositionId === actorPositionId;
      if (!isParentPrimaryExecutor && !isAssigningAuthority) {
        throw new ForbiddenException(
          'Only the primary responsible executor or assigning authority may create subtasks',
        );
      }
      depth = parent.depth + 1;
    }

    // Determine initial status
    const initialStatus = taskType.supportsDraft ? TaskStatus.DRAFT : TaskStatus.ASSIGNED;

    const task = this.taskRepo.create({
      typeId: dto.typeId,
      title: dto.title,
      description: dto.description ?? null,
      status: initialStatus,
      priority: dto.priority ?? TaskPriority.NORMAL,
      source: dto.source ?? TaskSource.MANUAL,
      classification: dto.classification ?? 1,
      deadline: dto.deadline ?? null,
      assigningPositionId: actorPositionId,
      createdById: actorId,
      responsiblePositionId: dto.responsiblePositionId,
      parentTaskId: dto.parentTaskId ?? null,
      depth,
      sourceDocumentId: dto.sourceDocumentId ?? null,
      sourceResolutionId: dto.sourceResolutionId ?? null,
    });

    await this.taskRepo.save(task);

    // Create primary assignment record
    await this.createAssignmentRecord(
      task.id,
      dto.responsiblePositionId,
      AssignmentType.PRIMARY,
      actorPositionId,
      actorId,
      dto.deadline ?? null,
    );

    // Create co-executor assignments
    if (dto.coExecutors?.length && taskType.supportsCoExecutors) {
      for (const coEx of dto.coExecutors) {
        await this.assertAssignmentAuthority(actorPositionId, coEx.positionId);
        await this.createAssignmentRecord(
          task.id,
          coEx.positionId,
          AssignmentType.CO_EXECUTOR,
          actorPositionId,
          actorId,
          coEx.deadline ?? null,
        );
      }
    }

    // Record history
    await this.recordHistory(task.id, 'task_created', actorId, actorPositionId, null, {
      status: task.status,
      responsiblePositionId: task.responsiblePositionId,
    });

    await this.auditService.emit({
      eventType: 'TASK_CREATED',
      resourceType: 'task',
      resourceId: task.id,
      actorId,
      details: { title: task.title, status: task.status, responsiblePositionId: task.responsiblePositionId },
    });

    this.eventEmitter.emit('task.created', { taskId: task.id, actorId, actorPositionId });

    return this.taskRepo.findOne({
      where: { id: task.id },
      relations: ['assignments', 'type'],
    }) as Promise<Task>;
  }

  // ─── Read ────────────────────────────────────────────────────────────────────

  async listTasks(
    dto: ListTasksDto,
    actorId: string,
    actorClearance: number,
  ): Promise<{ data: Task[]; total: number }> {
    const qb = this.taskRepo
      .createQueryBuilder('task')
      .leftJoinAndSelect('task.type', 'type')
      .where('task.classification <= :clearance', { clearance: actorClearance });

    if (dto.status) qb.andWhere('task.status = :status', { status: dto.status });
    if (dto.priority) qb.andWhere('task.priority = :priority', { priority: dto.priority });
    if (dto.responsiblePositionId) {
      qb.andWhere('task.responsiblePositionId = :rp', { rp: dto.responsiblePositionId });
    }
    if (dto.assigningPositionId) {
      qb.andWhere('task.assigningPositionId = :ap', { ap: dto.assigningPositionId });
    }
    if (dto.typeId) qb.andWhere('task.typeId = :typeId', { typeId: dto.typeId });
    if (dto.isOverdue !== undefined) qb.andWhere('task.isOverdue = :od', { od: dto.isOverdue });
    if (dto.from) qb.andWhere('task.createdAt >= :from', { from: dto.from });
    if (dto.to) qb.andWhere('task.createdAt <= :to', { to: dto.to });
    if (dto.parentTaskId !== undefined) {
      qb.andWhere('task.parentTaskId = :pid', { pid: dto.parentTaskId });
    }

    const [data, total] = await qb
      .orderBy('task.createdAt', 'DESC')
      .limit(dto.limit ?? 20)
      .offset(dto.offset ?? 0)
      .getManyAndCount();

    return { data, total };
  }

  async getTask(id: string, actorClearance: number): Promise<Task> {
    const task = await this.taskRepo.findOne({
      where: { id },
      relations: ['type', 'assignments', 'comments', 'attachments', 'subtasks'],
    });
    if (!task) throw new NotFoundException(`Task ${id} not found`);
    this.assertClearance(actorClearance, task.classification);
    return task;
  }

  async getTaskHistory(id: string, actorClearance: number): Promise<TaskHistory[]> {
    const task = await this.taskRepo.findOne({ where: { id } });
    if (!task) throw new NotFoundException(`Task ${id} not found`);
    this.assertClearance(actorClearance, task.classification);
    return this.historyRepo.find({
      where: { taskId: id },
      order: { createdAt: 'DESC' },
    });
  }

  // ─── Update ──────────────────────────────────────────────────────────────────

  async updateTask(
    id: string,
    dto: UpdateTaskDto,
    actorId: string,
    actorPositionId: string,
    actorClearance: number,
  ): Promise<Task> {
    const task = await this.taskRepo.findOne({ where: { id } });
    if (!task) throw new NotFoundException(`Task ${id} not found`);
    this.assertClearance(actorClearance, task.classification);

    // Only assigning authority or direct supervisor may update
    const canUpdate =
      task.assigningPositionId === actorPositionId ||
      (await this.orgService.isSubordinateTo(task.responsiblePositionId, actorPositionId));
    if (!canUpdate) throw new ForbiddenException('Only the assigning authority or supervisor may update this task');

    // Tasks beyond DRAFT/ASSIGNED allow only deadline and description changes
    const isEarlyStage = [TaskStatus.DRAFT, TaskStatus.ASSIGNED].includes(task.status);
    if (!isEarlyStage && (dto.title || dto.priority !== undefined)) {
      throw new BadRequestException('Title and priority can only be changed before the task is accepted');
    }

    const previous = { title: task.title, priority: task.priority, deadline: task.deadline };

    if (dto.title) task.title = dto.title;
    if (dto.description !== undefined) task.description = dto.description ?? null;
    if (dto.priority) task.priority = dto.priority;
    if (dto.deadline !== undefined) task.deadline = dto.deadline ?? null;
    if (dto.classification !== undefined) task.classification = dto.classification;

    await this.taskRepo.save(task);

    await this.recordHistory(task.id, 'task_updated', actorId, actorPositionId, previous, {
      title: task.title,
      priority: task.priority,
      deadline: task.deadline,
      reason: dto.changeReason,
    });

    await this.auditService.emit({
      eventType: 'TASK_UPDATED',
      resourceType: 'task',
      resourceId: task.id,
      actorId,
      details: { changes: dto, reason: dto.changeReason },
    });

    this.eventEmitter.emit('task.updated', {
      taskId: task.id,
      actorId,
      actorPositionId,
    });

    return task;
  }

  // ─── State Machine ───────────────────────────────────────────────────────────

  async transitionStatus(
    id: string,
    dto: TransitionTaskStatusDto,
    actorId: string,
    actorPositionId: string,
    actorClearance: number,
  ): Promise<Task> {
    const task = await this.taskRepo.findOne({ where: { id }, relations: ['type'] });
    if (!task) throw new NotFoundException(`Task ${id} not found`);
    this.assertClearance(actorClearance, task.classification);

    const { targetStatus } = dto;

    // Validate the transition is allowed in the state machine
    const allowed = TASK_TRANSITIONS[task.status];
    if (!allowed.includes(targetStatus)) {
      throw new BadRequestException(
        `Transition from ${task.status} to ${targetStatus} is not allowed`,
      );
    }

    // Authority checks per transition
    await this.assertTransitionAuthority(task, targetStatus, actorPositionId);

    // Validate required fields per target status
    if (targetStatus === TaskStatus.ON_HOLD && !dto.reason) {
      throw new BadRequestException('ON_HOLD transition requires a reason');
    }
    if (targetStatus === TaskStatus.CANNOT_EXECUTE && !dto.reason) {
      throw new BadRequestException('CANNOT_EXECUTE transition requires a reason');
    }
    if (targetStatus === TaskStatus.CANCELLED && !dto.reason) {
      throw new BadRequestException('CANCELLED transition requires a reason');
    }
    if (targetStatus === TaskStatus.COMPLETED && !dto.completionReport) {
      throw new BadRequestException('COMPLETED transition requires a completion report');
    }
    if (targetStatus === TaskStatus.RETURNED && !dto.reason) {
      throw new BadRequestException('RETURNED transition requires a reason');
    }

    const previousStatus = task.status;
    task.status = targetStatus;

    // Apply status-specific side effects
    if (targetStatus === TaskStatus.ACCEPTED) {
      const assignment = await this.assignmentRepo.findOne({
        where: { taskId: id, positionId: actorPositionId, assignmentType: AssignmentType.PRIMARY },
      });
      if (assignment) {
        assignment.acceptedAt = new Date();
        await this.assignmentRepo.save(assignment);
      }
    }

    if (targetStatus === TaskStatus.COMPLETED) {
      task.completionReport = dto.completionReport ?? null;
      task.completedAt = new Date();
      task.progressPercent = 100;
    }

    if (targetStatus === TaskStatus.CANCELLED) {
      task.cancelReason = dto.reason ?? null;
      task.cancelledAt = new Date();
    }

    if (targetStatus === TaskStatus.ON_HOLD) {
      task.holdReason = dto.reason ?? null;
    }

    if (targetStatus === TaskStatus.IN_PROGRESS && task.holdReason) {
      task.holdReason = null;
    }

    if (targetStatus === TaskStatus.CANNOT_EXECUTE) {
      task.cannotExecuteReason = dto.reason ?? null;
    }

    await this.taskRepo.save(task);

    await this.recordHistory(task.id, 'status_changed', actorId, actorPositionId,
      { status: previousStatus },
      { status: targetStatus, reason: dto.reason, completionReport: dto.completionReport },
    );

    await this.auditService.emit({
      eventType: 'TASK_STATUS_CHANGED',
      resourceType: 'task',
      resourceId: task.id,
      actorId,
      details: { from: previousStatus, to: targetStatus, reason: dto.reason },
    });

    this.eventEmitter.emit('task.status_changed', {
      taskId: task.id,
      from: previousStatus,
      to: targetStatus,
      actorId,
      actorPositionId,
    });

    // 2.3.3 — Propagate status to parent task
    if (task.parentTaskId) {
      await this.propagateToParent(task.parentTaskId, actorId, actorPositionId).catch((err) =>
        this.logger.error(`Parent propagation failed for task ${task.id}: ${err.message}`, err.stack),
      );
    }

    // 2.3.4 — Emit channel creation request on first assignment
    if (previousStatus === TaskStatus.DRAFT && targetStatus === TaskStatus.ASSIGNED) {
      await this.outboxService.publish(
        'task.channel_requested',
        {
          taskId: task.id,
          taskTitle: task.title,
          responsiblePositionId: task.responsiblePositionId,
          assigningPositionId: task.assigningPositionId,
        },
        {
          source: 'tasks',
          aggregateType: 'task',
          aggregateId: task.id,
        },
      );
    }

    return task;
  }

  // ─── Parent-Child Status Propagation (2.3.3) ─────────────────────────────────

  /**
   * When all children reach a terminal state, auto-complete the parent.
   * When any child is ON_HOLD / CANNOT_EXECUTE, flag the parent as blocked.
   */
  private async propagateToParent(
    parentTaskId: string,
    actorId: string,
    actorPositionId: string,
  ): Promise<void> {
    const parent = await this.taskRepo.findOne({ where: { id: parentTaskId } });
    if (!parent) return;

    const children = await this.taskRepo.find({ where: { parentTaskId } });
    if (!children.length) return;

    const terminalStatuses = new Set([
      TaskStatus.COMPLETED, TaskStatus.VERIFIED, TaskStatus.CANCELLED, TaskStatus.CLOSED,
    ]);
    const blockingStatuses = new Set([TaskStatus.ON_HOLD, TaskStatus.CANNOT_EXECUTE]);

    const allDone = children.every(c => terminalStatuses.has(c.status));
    const anyBlocking = children.some(c => blockingStatuses.has(c.status));

    if (allDone && parent.status === TaskStatus.IN_PROGRESS) {
      // All children done — parent can be completed by its executor
      // We emit a notification rather than auto-completing (human must confirm)
      await this.outboxService.publish(
        'notification.requested',
        {
          type: 'TASK_ALL_SUBTASKS_COMPLETE',
          recipientPositionId: parent.responsiblePositionId,
          priority: 'normal',
          payload: { taskId: parent.id, taskTitle: parent.title },
        },
        {
          source: 'tasks',
          aggregateType: 'task',
          aggregateId: parent.id,
        },
      );

      await this.recordHistory(parent.id, 'all_subtasks_completed', actorId, actorPositionId, null, {
        childCount: children.length,
      });
    }

    if (anyBlocking && parent.status === TaskStatus.IN_PROGRESS) {
      const blockedChild = children.find(c => blockingStatuses.has(c.status));
      await this.outboxService.publish(
        'notification.requested',
        {
          type: 'TASK_SUBTASK_BLOCKED',
          recipientPositionId: parent.responsiblePositionId,
          priority: 'high',
          payload: {
            taskId: parent.id,
            taskTitle: parent.title,
            blockedChildId: blockedChild?.id,
            blockedStatus: blockedChild?.status,
          },
        },
        {
          source: 'tasks',
          aggregateType: 'task',
          aggregateId: parent.id,
        },
      );
    }
  }

  // ─── Supervisor Oversight (2.3.1) ─────────────────────────────────────────────

  /**
   * Returns all tasks assigned to positions that are subordinate to the supervisor.
   * Used for oversight dashboards and escalation review.
   */
  async listTasksForSupervisor(
    supervisorPositionId: string,
    actorClearance: number,
    filters?: { status?: TaskStatus; isOverdue?: boolean; limit?: number; offset?: number },
  ): Promise<{ data: Task[]; total: number }> {
    // Resolve all subordinate positions
    const subordinates = await this.getSubordinatePositionIds(supervisorPositionId);
    if (!subordinates.length) return { data: [], total: 0 };

    const qb = this.taskRepo
      .createQueryBuilder('task')
      .leftJoinAndSelect('task.type', 'type')
      .where('task.classification <= :clearance', { clearance: actorClearance })
      .andWhere('task.responsiblePositionId IN (:...positions)', { positions: subordinates });

    if (filters?.status) qb.andWhere('task.status = :status', { status: filters.status });
    if (filters?.isOverdue !== undefined) qb.andWhere('task.isOverdue = :od', { od: filters.isOverdue });

    const [data, total] = await qb
      .orderBy('task.isOverdue', 'DESC')
      .addOrderBy('task.deadline', 'ASC', 'NULLS LAST')
      .addOrderBy('task.createdAt', 'DESC')
      .limit(filters?.limit ?? 50)
      .offset(filters?.offset ?? 0)
      .getManyAndCount();

    return { data, total };
  }

  private async getSubordinatePositionIds(supervisorPositionId: string): Promise<string[]> {
    // Recursive CTE traversal of positions via reports_to_id
    const rows = await this.dataSource.query<Array<{ id: string }>>(
      `WITH RECURSIVE subordinates AS (
         SELECT id
         FROM   org.positions
         WHERE  reports_to_id = $1 AND active = true
         UNION ALL
         SELECT p.id
         FROM   org.positions p
         INNER JOIN subordinates s ON p.reports_to_id = s.id
         WHERE  p.active = true
       )
       SELECT id FROM subordinates`,
      [supervisorPositionId],
    );
    return rows.map(r => r.id);
  }

  // ─── Progress ────────────────────────────────────────────────────────────────

  async updateProgress(
    id: string,
    dto: UpdateProgressDto,
    actorId: string,
    actorPositionId: string,
    actorClearance: number,
  ): Promise<Task> {
    const task = await this.taskRepo.findOne({ where: { id } });
    if (!task) throw new NotFoundException(`Task ${id} not found`);
    this.assertClearance(actorClearance, task.classification);

    // Only primary or co-executors may file progress updates
    const isParticipant = await this.isTaskParticipant(id, actorPositionId);
    if (!isParticipant) throw new ForbiddenException('Only task participants may update progress');

    const prev = { progressPercent: task.progressPercent, progressNote: task.progressNote };
    task.progressPercent = dto.progressPercent;
    task.progressNote = dto.progressNote ?? task.progressNote;

    await this.taskRepo.save(task);

    await this.recordHistory(task.id, 'progress_updated', actorId, actorPositionId, prev, {
      progressPercent: task.progressPercent,
      progressNote: task.progressNote,
    });

    await this.auditService.emit({
      eventType: 'TASK_PROGRESS_UPDATED',
      resourceType: 'task',
      resourceId: task.id,
      actorId,
      details: { progressPercent: task.progressPercent },
    });

    return task;
  }

  // ─── Executors ───────────────────────────────────────────────────────────────

  async addExecutor(
    id: string,
    dto: AddExecutorDto,
    actorId: string,
    actorPositionId: string,
    actorClearance: number,
  ): Promise<TaskAssignment> {
    const task = await this.taskRepo.findOne({ where: { id }, relations: ['type'] });
    if (!task) throw new NotFoundException(`Task ${id} not found`);
    this.assertClearance(actorClearance, task.classification);

    if (!task.type.supportsCoExecutors) {
      throw new BadRequestException(`TaskType '${task.type.name}' does not support co-executors`);
    }

    // Only assigning authority or primary executor may add co-executors
    const isPrimaryExecutor = task.responsiblePositionId === actorPositionId;
    const isAssigningAuthority = task.assigningPositionId === actorPositionId;
    if (!isPrimaryExecutor && !isAssigningAuthority) {
      throw new ForbiddenException('Only the primary executor or assigning authority may add co-executors');
    }

    // Validate command chain authority for the new executor
    await this.assertAssignmentAuthority(actorPositionId, dto.positionId);

    // Check for duplicate
    const existing = await this.assignmentRepo.findOne({
      where: { taskId: id, positionId: dto.positionId, status: AssignmentStatus.ACTIVE },
    });
    if (existing) throw new BadRequestException('This position is already assigned to the task');

    const assignment = await this.createAssignmentRecord(
      id,
      dto.positionId,
      dto.assignmentType ?? AssignmentType.CO_EXECUTOR,
      actorPositionId,
      actorId,
      dto.deadline ?? null,
    );

    await this.recordHistory(task.id, 'executor_added', actorId, actorPositionId, null, {
      positionId: dto.positionId,
      assignmentType: assignment.assignmentType,
    });

    await this.auditService.emit({
      eventType: 'TASK_EXECUTOR_ADDED',
      resourceType: 'task',
      resourceId: task.id,
      actorId,
      details: { positionId: dto.positionId },
    });

    this.eventEmitter.emit('task.executor_added', { taskId: id, positionId: dto.positionId, actorId });

    return assignment;
  }

  async removeExecutor(
    taskId: string,
    assignmentId: string,
    actorId: string,
    actorPositionId: string,
    actorClearance: number,
    reason?: string,
  ): Promise<void> {
    const task = await this.taskRepo.findOne({ where: { id: taskId } });
    if (!task) throw new NotFoundException(`Task ${taskId} not found`);
    this.assertClearance(actorClearance, task.classification);

    const assignment = await this.assignmentRepo.findOne({
      where: { id: assignmentId, taskId, status: AssignmentStatus.ACTIVE },
    });
    if (!assignment) throw new NotFoundException(`Assignment ${assignmentId} not found`);
    if (assignment.assignmentType === AssignmentType.PRIMARY) {
      throw new BadRequestException('Cannot remove the primary responsible executor via this endpoint. Reassign instead.');
    }

    const isAssigningAuthority = task.assigningPositionId === actorPositionId;
    const isPrimaryExecutor = task.responsiblePositionId === actorPositionId;
    if (!isAssigningAuthority && !isPrimaryExecutor) {
      throw new ForbiddenException('Only the assigning authority or primary executor may remove co-executors');
    }

    assignment.status = AssignmentStatus.REMOVED;
    assignment.removedAt = new Date();
    assignment.removeReason = reason ?? null;
    await this.assignmentRepo.save(assignment);

    await this.recordHistory(task.id, 'executor_removed', actorId, actorPositionId, null, {
      positionId: assignment.positionId,
      reason,
    });

    await this.auditService.emit({
      eventType: 'TASK_EXECUTOR_REMOVED',
      resourceType: 'task',
      resourceId: task.id,
      actorId,
      details: { positionId: assignment.positionId, reason },
    });
  }

  // ─── Comments ────────────────────────────────────────────────────────────────

  async addComment(
    taskId: string,
    dto: AddCommentDto,
    actorId: string,
    actorPositionId: string,
    actorClearance: number,
  ): Promise<TaskComment> {
    const task = await this.taskRepo.findOne({ where: { id: taskId } });
    if (!task) throw new NotFoundException(`Task ${taskId} not found`);
    this.assertClearance(actorClearance, task.classification);

    const isParticipant = await this.isTaskParticipantOrSupervisor(taskId, actorPositionId, task);
    if (!isParticipant) throw new ForbiddenException('You do not have access to comment on this task');

    const comment = this.commentRepo.create({
      taskId,
      authorId: actorId,
      authorPositionId: actorPositionId,
      body: dto.body,
      isInternal: dto.isInternal ?? false,
    });
    await this.commentRepo.save(comment);

    await this.auditService.emit({
      eventType: 'TASK_COMMENT_ADDED',
      resourceType: 'task',
      resourceId: taskId,
      actorId,
      details: { isInternal: comment.isInternal },
    });

    return comment;
  }

  async getComments(
    taskId: string,
    actorPositionId: string,
    actorClearance: number,
    includeInternal: boolean,
  ): Promise<TaskComment[]> {
    const task = await this.taskRepo.findOne({ where: { id: taskId } });
    if (!task) throw new NotFoundException(`Task ${taskId} not found`);
    this.assertClearance(actorClearance, task.classification);
    const hasAccess = await this.isTaskParticipantOrSupervisor(taskId, actorPositionId, task);
    if (!hasAccess) throw new ForbiddenException('You do not have access to comments on this task');

    const qb = this.commentRepo
      .createQueryBuilder('c')
      .where('c.taskId = :taskId', { taskId })
      .andWhere('c.deletedAt IS NULL')
      .orderBy('c.createdAt', 'ASC');

    if (!includeInternal) {
      qb.andWhere('c.isInternal = false');
    }

    return qb.getMany();
  }

  // ─── Attachments ─────────────────────────────────────────────────────────────

  async addAttachment(
    taskId: string,
    dto: AddAttachmentDto,
    actorId: string,
    actorPositionId: string,
    actorClearance: number,
  ): Promise<TaskAttachment> {
    const task = await this.taskRepo.findOne({ where: { id: taskId } });
    if (!task) throw new NotFoundException(`Task ${taskId} not found`);
    this.assertClearance(actorClearance, task.classification);

    const isParticipant = await this.isTaskParticipantOrSupervisor(taskId, actorPositionId, task);
    if (!isParticipant) throw new ForbiddenException('You do not have access to attach files to this task');

    const attachment = this.attachmentRepo.create({
      taskId,
      fileId: dto.fileId,
      fileName: dto.fileName,
      mimeType: dto.mimeType ?? null,
      fileSizeBytes: dto.fileSizeBytes ?? null,
      uploaderId: actorId,
      uploaderPositionId: actorPositionId,
      classification: dto.classification ?? task.classification,
    });
    await this.attachmentRepo.save(attachment);

    await this.auditService.emit({
      eventType: 'TASK_ATTACHMENT_ADDED',
      resourceType: 'task',
      resourceId: taskId,
      actorId,
      details: { fileId: dto.fileId, fileName: dto.fileName },
    });

    return attachment;
  }

  async removeAttachment(
    taskId: string,
    attachmentId: string,
    actorId: string,
    actorPositionId: string,
    actorClearance: number,
  ): Promise<void> {
    const task = await this.taskRepo.findOne({ where: { id: taskId } });
    if (!task) throw new NotFoundException(`Task ${taskId} not found`);
    this.assertClearance(actorClearance, task.classification);
    const hasAccess = await this.isTaskParticipantOrSupervisor(taskId, actorPositionId, task);
    if (!hasAccess) throw new ForbiddenException('You do not have access to remove files from this task');

    const attachment = await this.attachmentRepo.findOne({
      where: { id: attachmentId, taskId, removedAt: IsNull() },
    });
    if (!attachment) throw new NotFoundException(`Attachment ${attachmentId} not found`);

    attachment.removedAt = new Date();
    await this.attachmentRepo.save(attachment);

    await this.auditService.emit({
      eventType: 'TASK_ATTACHMENT_REMOVED',
      resourceType: 'task',
      resourceId: taskId,
      actorId,
      details: { fileId: attachment.fileId, fileName: attachment.fileName },
    });
  }

  // ─── Overdue detection (called by scheduler) ──────────────────────────────────

  /**
   * Mark tasks as overdue when their deadline has passed.
   * Called by a scheduled job — does not require actor context.
   */
  async markOverdueTasks(): Promise<number> {
    const now = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    const activeTasks = await this.taskRepo
      .createQueryBuilder('task')
      .where('task.deadline < :now', { now })
      .andWhere('task.isOverdue = false')
      .andWhere('task.status NOT IN (:...terminalStatuses)', {
        terminalStatuses: [
          TaskStatus.COMPLETED,
          TaskStatus.VERIFIED,
          TaskStatus.CANCELLED,
          TaskStatus.CLOSED,
          TaskStatus.CANNOT_EXECUTE,
        ],
      })
      .getMany();

    if (!activeTasks.length) return 0;

    for (const task of activeTasks) {
      task.isOverdue = true;
      task.overdueAt = new Date();
      await this.taskRepo.save(task);

      await this.recordHistory(task.id, 'marked_overdue', 'system', null, null, {
        deadline: task.deadline,
        status: task.status,
      });

      this.eventEmitter.emit('task.overdue', {
        taskId: task.id,
        responsiblePositionId: task.responsiblePositionId,
        assigningPositionId: task.assigningPositionId,
        deadline: task.deadline,
      });
    }

    this.logger.log(`Marked ${activeTasks.length} tasks as overdue`);
    return activeTasks.length;
  }

  // ─── Reassignment (§6.5) ─────────────────────────────────────────────────────

  /**
   * Reassign the primary responsible position of a task.
   * Only the assigning authority or a superior in the command chain may reassign.
   * A modification record is permanently written to the task history.
   */
  async reassignTask(
    taskId: string,
    dto: ReassignTaskDto,
    actorId: string,
    actorPositionId: string,
    actorClearance: number,
  ): Promise<Task> {
    const task = await this.taskRepo.findOne({ where: { id: taskId } });
    if (!task) throw new NotFoundException(`Task ${taskId} not found`);
    this.assertClearance(actorClearance, task.classification);

    const isAssigningAuthority = task.assigningPositionId === actorPositionId;
    const isSupervisor = await this.orgService.isSubordinateTo(task.responsiblePositionId, actorPositionId);
    if (!isAssigningAuthority && !isSupervisor) {
      throw new ForbiddenException('Only the assigning authority or supervisor can reassign this task');
    }

    // New position must still be within the actor's command chain
    await this.assertAssignmentAuthority(actorPositionId, dto.newPositionId);

    const previousPositionId = task.responsiblePositionId;

    // Deactivate current primary assignment
    const currentAssignment = await this.assignmentRepo.findOne({
      where: {
        taskId,
        positionId: previousPositionId,
        assignmentType: AssignmentType.PRIMARY,
        status: AssignmentStatus.ACTIVE,
      },
    });
    if (currentAssignment) {
      currentAssignment.status = AssignmentStatus.REMOVED;
      currentAssignment.removedAt = new Date();
      currentAssignment.removeReason = `Reassigned: ${dto.reason}`;
      await this.assignmentRepo.save(currentAssignment);
    }

    task.responsiblePositionId = dto.newPositionId;
    await this.taskRepo.save(task);

    // New primary assignment record
    await this.createAssignmentRecord(
      taskId,
      dto.newPositionId,
      AssignmentType.PRIMARY,
      actorPositionId,
      actorId,
      task.deadline,
    );

    await this.recordHistory(taskId, 'task_reassigned', actorId, actorPositionId,
      { responsiblePositionId: previousPositionId },
      { responsiblePositionId: dto.newPositionId, reason: dto.reason },
    );

    await this.auditService.emit({
      eventType: 'TASK_REASSIGNED',
      resourceType: 'task',
      resourceId: taskId,
      actorId,
      details: { previousPositionId, newPositionId: dto.newPositionId, reason: dto.reason },
    });

    this.eventEmitter.emit('notification.requested', {
      type: 'TASK_REASSIGNED',
      recipientPositionId: dto.newPositionId,
      priority: 'normal',
      payload: { taskId: task.id, taskTitle: task.title, deadline: task.deadline, reason: dto.reason },
    });

    this.eventEmitter.emit('notification.requested', {
      type: 'TASK_REASSIGNED_AWAY',
      recipientPositionId: previousPositionId,
      priority: 'normal',
      payload: { taskId: task.id, taskTitle: task.title, newPositionId: dto.newPositionId, reason: dto.reason },
    });

    this.eventEmitter.emit('task.reassigned', {
      taskId,
      previousPositionId,
      newPositionId: dto.newPositionId,
      actorId,
      actorPositionId,
    });

    return this.taskRepo.findOne({
      where: { id: taskId },
      relations: ['assignments', 'type'],
    }) as Promise<Task>;
  }

  // ─── Deadline Extension Request (§4.10, §17.3) ────────────────────────────────

  /** File a formal deadline extension request. Only the responsible executor may file. */
  async requestDeadlineExtension(
    taskId: string,
    dto: import('../dto/request-deadline-extension.dto').RequestDeadlineExtensionDto,
    actorId: string,
    actorPositionId: string,
    actorClearance: number,
  ): Promise<TaskDeadlineExtensionRequest> {
    const task = await this.taskRepo.findOne({ where: { id: taskId } });
    if (!task) throw new NotFoundException(`Task ${taskId} not found`);
    this.assertClearance(actorClearance, task.classification);

    if (task.responsiblePositionId !== actorPositionId) {
      throw new ForbiddenException('Only the responsible executor may file a deadline extension request');
    }

    if (!task.deadline) {
      throw new BadRequestException('Cannot request a deadline extension for a task with no deadline');
    }

    if (dto.requestedDeadline <= task.deadline) {
      throw new BadRequestException('Requested deadline must be after the current deadline');
    }

    // Only one PENDING request allowed at a time
    const existing = await this.extensionRepo.findOne({
      where: { taskId, status: TaskExtensionStatus.PENDING },
    });
    if (existing) {
      throw new BadRequestException('A pending deadline extension request already exists for this task');
    }

    const request = this.extensionRepo.create({
      taskId,
      requesterPositionId: actorPositionId,
      requesterId: actorId,
      currentDeadline: task.deadline,
      requestedDeadline: dto.requestedDeadline,
      justification: dto.justification,
      status: TaskExtensionStatus.PENDING,
    });
    await this.extensionRepo.save(request);

    await this.recordHistory(taskId, 'deadline_extension_requested', actorId, actorPositionId, null, {
      requestId: request.id,
      currentDeadline: task.deadline,
      requestedDeadline: dto.requestedDeadline,
      justification: dto.justification,
    });

    await this.auditService.emit({
      eventType: 'TASK_DEADLINE_EXTENSION_REQUESTED',
      resourceType: 'task',
      resourceId: taskId,
      actorId,
      details: { requestId: request.id, requestedDeadline: dto.requestedDeadline },
    });

    // Notify the assigning authority for review
    this.eventEmitter.emit('notification.requested', {
      type: 'TASK_DEADLINE_EXTENSION_REQUESTED',
      recipientPositionId: task.assigningPositionId,
      priority: 'normal',
      payload: {
        taskId: task.id,
        taskTitle: task.title,
        requestId: request.id,
        currentDeadline: task.deadline,
        requestedDeadline: dto.requestedDeadline,
        justification: dto.justification,
      },
    });

    return request;
  }

  /** Approve or deny a pending deadline extension request. */
  async reviewDeadlineExtension(
    taskId: string,
    requestId: string,
    dto: import('../dto/review-deadline-extension.dto').ReviewDeadlineExtensionDto,
    actorId: string,
    actorPositionId: string,
    actorClearance: number,
  ): Promise<TaskDeadlineExtensionRequest> {
    const task = await this.taskRepo.findOne({ where: { id: taskId } });
    if (!task) throw new NotFoundException(`Task ${taskId} not found`);
    this.assertClearance(actorClearance, task.classification);

    const isAssigningAuthority = task.assigningPositionId === actorPositionId;
    const isSupervisor = await this.orgService.isSubordinateTo(task.responsiblePositionId, actorPositionId);
    if (!isAssigningAuthority && !isSupervisor) {
      throw new ForbiddenException('Only the assigning authority or supervisor can review a deadline extension request');
    }

    if (dto.decision === TaskExtensionStatus.DENIED && (!dto.remarks || dto.remarks.length < 10)) {
      throw new BadRequestException('A denial requires remarks explaining why the extension is not granted');
    }

    const request = await this.extensionRepo.findOne({
      where: { id: requestId, taskId, status: TaskExtensionStatus.PENDING },
    });
    if (!request) throw new NotFoundException(`Pending extension request ${requestId} not found`);

    request.status = dto.decision;
    request.reviewedByPositionId = actorPositionId;
    request.reviewedById = actorId;
    request.reviewRemarks = dto.remarks ?? null;
    request.reviewedAt = new Date();
    await this.extensionRepo.save(request);

    if (dto.decision === TaskExtensionStatus.APPROVED) {
      const previousDeadline = task.deadline;
      task.deadline = request.requestedDeadline;
      task.isOverdue = false;
      task.overdueAt = null;
      await this.taskRepo.save(task);

      await this.recordHistory(taskId, 'deadline_extended', actorId, actorPositionId,
        { deadline: previousDeadline },
        { deadline: request.requestedDeadline, requestId, reason: dto.remarks },
      );
    }

    await this.auditService.emit({
      eventType: dto.decision === TaskExtensionStatus.APPROVED
        ? 'TASK_DEADLINE_EXTENSION_APPROVED'
        : 'TASK_DEADLINE_EXTENSION_DENIED',
      resourceType: 'task',
      resourceId: taskId,
      actorId,
      details: {
        requestId,
        decision: dto.decision,
        requestedDeadline: request.requestedDeadline,
        remarks: dto.remarks,
      },
    });

    // Notify the executor of the decision
    this.eventEmitter.emit('notification.requested', {
      type: dto.decision === TaskExtensionStatus.APPROVED
        ? 'TASK_DEADLINE_EXTENSION_APPROVED'
        : 'TASK_DEADLINE_EXTENSION_DENIED',
      recipientPositionId: request.requesterPositionId,
      priority: 'normal',
      payload: {
        taskId: task.id,
        taskTitle: task.title,
        requestId,
        requestedDeadline: request.requestedDeadline,
        remarks: dto.remarks,
      },
    });

    return request;
  }

  /** List all deadline extension requests for a task. */
  async listDeadlineExtensions(
    taskId: string,
    actorClearance: number,
  ): Promise<TaskDeadlineExtensionRequest[]> {
    const task = await this.taskRepo.findOne({ where: { id: taskId } });
    if (!task) throw new NotFoundException(`Task ${taskId} not found`);
    this.assertClearance(actorClearance, task.classification);

    return this.extensionRepo.find({
      where: { taskId },
      order: { createdAt: 'DESC' },
    });
  }

  // ─── Task Types (admin, §17.1) ────────────────────────────────────────────────

  async listTaskTypes(): Promise<TaskType[]> {
    return this.typeRepo.find({ where: { active: true } });
  }

  async createTaskType(
    dto: import('../dto/create-task-type.dto').CreateTaskTypeDto,
  ): Promise<TaskType> {
    const existing = await this.typeRepo.findOne({ where: { name: dto.name } });
    if (existing) throw new BadRequestException(`TaskType '${dto.name}' already exists`);

    const taskType = this.typeRepo.create({
      name: dto.name,
      nameRu: dto.nameRu ?? null,
      nameTg: dto.nameTg ?? null,
      description: dto.description ?? null,
      defaultPriority: dto.defaultPriority ?? 2,
      defaultDeadlineDays: dto.defaultDeadlineDays ?? null,
      requiresAcceptance: dto.requiresAcceptance ?? false,
      requiresVerification: dto.requiresVerification ?? false,
      supportsCoExecutors: dto.supportsCoExecutors ?? true,
      supportsSubtasks: dto.supportsSubtasks ?? true,
      supportsDraft: dto.supportsDraft ?? false,
      active: true,
    });
    return this.typeRepo.save(taskType);
  }

  async updateTaskType(
    id: string,
    dto: import('../dto/update-task-type.dto').UpdateTaskTypeDto,
  ): Promise<TaskType> {
    const taskType = await this.typeRepo.findOne({ where: { id } });
    if (!taskType) throw new NotFoundException(`TaskType ${id} not found`);

    if (dto.name !== undefined) taskType.name = dto.name;
    if (dto.nameRu !== undefined) taskType.nameRu = dto.nameRu ?? null;
    if (dto.nameTg !== undefined) taskType.nameTg = dto.nameTg ?? null;
    if (dto.description !== undefined) taskType.description = dto.description ?? null;
    if (dto.defaultPriority !== undefined) taskType.defaultPriority = dto.defaultPriority;
    if (dto.defaultDeadlineDays !== undefined) taskType.defaultDeadlineDays = dto.defaultDeadlineDays ?? null;
    if (dto.requiresAcceptance !== undefined) taskType.requiresAcceptance = dto.requiresAcceptance;
    if (dto.requiresVerification !== undefined) taskType.requiresVerification = dto.requiresVerification;
    if (dto.supportsCoExecutors !== undefined) taskType.supportsCoExecutors = dto.supportsCoExecutors;
    if (dto.supportsSubtasks !== undefined) taskType.supportsSubtasks = dto.supportsSubtasks;
    if (dto.supportsDraft !== undefined) taskType.supportsDraft = dto.supportsDraft;
    if (dto.active !== undefined) taskType.active = dto.active;

    return this.typeRepo.save(taskType);
  }

  // ─── Private helpers ─────────────────────────────────────────────────────────

  private async assertAssignmentAuthority(
    assignerPositionId: string,
    targetPositionId: string,
  ): Promise<void> {
    if (assignerPositionId === targetPositionId) return; // Self-assignment allowed

    const isSubordinate = await this.orgService.isSubordinateTo(targetPositionId, assignerPositionId);
    if (!isSubordinate) {
      throw new ForbiddenException(
        `You do not have assignment authority over the target position. ` +
        `Task assignment requires a direct command chain relationship.`,
      );
    }
  }

  private async assertTransitionAuthority(
    task: Task,
    targetStatus: TaskStatus,
    actorPositionId: string,
  ): Promise<void> {
    const isResponsibleExecutor = task.responsiblePositionId === actorPositionId;
    const isAssigningAuthority = task.assigningPositionId === actorPositionId;
    const isSupervisor = await this.orgService.isSubordinateTo(task.responsiblePositionId, actorPositionId);

    switch (targetStatus) {
      case TaskStatus.ACCEPTED:
        if (!isResponsibleExecutor) {
          throw new ForbiddenException('Only the responsible executor can accept a task');
        }
        break;

      case TaskStatus.IN_PROGRESS:
        if (!isResponsibleExecutor && !isSupervisor) {
          throw new ForbiddenException('Only the responsible executor or their supervisor can start progress');
        }
        break;

      case TaskStatus.COMPLETED:
        if (!isResponsibleExecutor) {
          throw new ForbiddenException('Only the responsible executor can complete a task');
        }
        break;

      case TaskStatus.VERIFIED:
      case TaskStatus.RETURNED:
        if (!isAssigningAuthority && !isSupervisor) {
          throw new ForbiddenException('Only the assigning authority or supervisor can verify or return a task');
        }
        break;

      case TaskStatus.CANCELLED:
        if (!isAssigningAuthority && !isSupervisor) {
          throw new ForbiddenException('Only the assigning authority or a supervisor can cancel a task');
        }
        break;

      case TaskStatus.ON_HOLD:
        if (!isResponsibleExecutor && !isSupervisor) {
          throw new ForbiddenException('Only the responsible executor or supervisor can place a task on hold');
        }
        break;

      case TaskStatus.CANNOT_EXECUTE:
        if (!isResponsibleExecutor) {
          throw new ForbiddenException('Only the responsible executor can declare inability to execute');
        }
        break;

      case TaskStatus.ASSIGNED:
        // Supervisor/assigning authority can re-open from CANNOT_EXECUTE
        if (!isAssigningAuthority && !isSupervisor) {
          throw new ForbiddenException('Only assigning authority or supervisor can reassign from CANNOT_EXECUTE');
        }
        break;

      case TaskStatus.CLOSED:
        if (!isAssigningAuthority && !isSupervisor) {
          throw new ForbiddenException('Only assigning authority or supervisor can close a task');
        }
        break;

      default:
        break;
    }
  }

  private assertClearance(userClearance: number, resourceClassification: number): void {
    if (userClearance < resourceClassification) {
      throw new ForbiddenException(
        `Clearance level ${userClearance} insufficient for classification level ${resourceClassification}`,
      );
    }
  }

  private async isTaskParticipant(taskId: string, positionId: string): Promise<boolean> {
    const assignment = await this.assignmentRepo.findOne({
      where: { taskId, positionId, status: AssignmentStatus.ACTIVE },
    });
    return !!assignment;
  }

  private async isTaskParticipantOrSupervisor(
    taskId: string,
    actorPositionId: string,
    task: Task,
  ): Promise<boolean> {
    const isParticipant = await this.isTaskParticipant(taskId, actorPositionId);
    if (isParticipant) return true;

    const isAssigningAuthority = task.assigningPositionId === actorPositionId;
    if (isAssigningAuthority) return true;

    return this.orgService.isSubordinateTo(task.responsiblePositionId, actorPositionId);
  }

  private async createAssignmentRecord(
    taskId: string,
    positionId: string,
    assignmentType: AssignmentType,
    assignedByPositionId: string,
    assignedByUserId: string,
    deadline: string | null,
  ): Promise<TaskAssignment> {
    const assignment = this.assignmentRepo.create({
      taskId,
      positionId,
      assignmentType,
      assignedByPositionId,
      assignedByUserId,
      deadline,
    });
    return this.assignmentRepo.save(assignment);
  }

  private async recordHistory(
    taskId: string,
    eventType: string,
    actorId: string,
    actorPositionId: string | null,
    previousValue: Record<string, unknown> | null,
    newValue: Record<string, unknown> | null,
    remark?: string,
  ): Promise<void> {
    const entry = this.historyRepo.create({
      taskId,
      eventType,
      actorId,
      actorPositionId,
      previousValue,
      newValue,
      remark: remark ?? null,
    });
    await this.historyRepo.save(entry).catch((err) => {
      // History recording must never block the main operation
      this.logger.error(`Failed to record task history: ${err.message}`, err.stack);
    });
  }
}
