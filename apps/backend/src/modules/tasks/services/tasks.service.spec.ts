import {
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { Repository, DataSource, ObjectLiteral } from 'typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';

import { TasksService } from './tasks.service';
import {
  Task,
  TaskStatus,
  TaskPriority,
  TaskSource,
  TASK_TRANSITIONS,
} from '../entities/task.entity';
import { TaskType } from '../entities/task-type.entity';
import { TaskAssignment, AssignmentType, AssignmentStatus } from '../entities/task-assignment.entity';
import { TaskHistory } from '../entities/task-history.entity';
import { TaskComment } from '../entities/task-comment.entity';
import { TaskAttachment } from '../entities/task-attachment.entity';
import { AuditService } from '../../audit/services/audit.service';
import { OrgService } from '../../org/services/org.service';
import { OutboxService } from '../../outbox/services/outbox.service';

// ── Mock helpers ───────────────────────────────────────────────────────────────

function mockRepo<T extends ObjectLiteral>(): jest.Mocked<Repository<T>> {
  const qb = {
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    leftJoinAndSelect: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    addOrderBy: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    offset: jest.fn().mockReturnThis(),
    getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
    getMany: jest.fn().mockResolvedValue([]),
    getOne: jest.fn().mockResolvedValue(null),
  };
  return {
    create: jest.fn((dto: Partial<T>) => ({ id: 'generated-id', ...dto }) as unknown as T),
    save: jest.fn().mockImplementation(async (entity: T) => entity),
    find: jest.fn().mockResolvedValue([]),
    findOne: jest.fn().mockResolvedValue(null),
    update: jest.fn().mockResolvedValue({ affected: 1 }),
    increment: jest.fn().mockResolvedValue({ affected: 1 }),
    createQueryBuilder: jest.fn().mockReturnValue(qb),
    _qb: qb,
  } as unknown as jest.Mocked<Repository<T>>;
}

function makeTaskType(overrides: Partial<TaskType> = {}): TaskType {
  return {
    id: 'type-1',
    name: 'Operational',
    description: null,
    active: true,
    supportsDraft: true,
    supportsSubtasks: true,
    supportsCoExecutors: true,
    defaultClassification: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as TaskType;
}

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 'task-1',
    typeId: 'type-1',
    type: makeTaskType(),
    title: 'Assess flood damage',
    description: null,
    status: TaskStatus.ASSIGNED,
    priority: TaskPriority.NORMAL,
    source: TaskSource.MANUAL,
    classification: 1,
    deadline: null,
    assigningPositionId: 'pos-supervisor',
    responsiblePositionId: 'pos-executor',
    createdById: 'user-supervisor',
    parentTaskId: null,
    depth: 0,
    isOverdue: false,
    overdueAt: null,
    progressPercent: 0,
    progressNote: null,
    completionReport: null,
    completedAt: null,
    cancelReason: null,
    cancelledAt: null,
    holdReason: null,
    cannotExecuteReason: null,
    sourceDocumentId: null,
    sourceResolutionId: null,
    assignments: [],
    subtasks: [],
    comments: [],
    attachments: [],
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as Task;
}

function makeAssignment(overrides: Partial<TaskAssignment> = {}): TaskAssignment {
  return {
    id: 'assign-1',
    taskId: 'task-1',
    positionId: 'pos-executor',
    userId: 'user-executor',
    assignmentType: AssignmentType.PRIMARY,
    status: AssignmentStatus.ACTIVE,
    assignedByPositionId: 'pos-supervisor',
    assignedByUserId: 'user-supervisor',
    deadline: null,
    acceptedAt: null,
    removedAt: null,
    removeReason: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as TaskAssignment;
}

// ── Test suite ─────────────────────────────────────────────────────────────────

describe('TasksService', () => {
  let service: TasksService;
  let taskRepo: jest.Mocked<Repository<Task>>;
  let typeRepo: jest.Mocked<Repository<TaskType>>;
  let assignmentRepo: jest.Mocked<Repository<TaskAssignment>>;
  let historyRepo: jest.Mocked<Repository<TaskHistory>>;
  let commentRepo: jest.Mocked<Repository<TaskComment>>;
  let attachmentRepo: jest.Mocked<Repository<TaskAttachment>>;
  let dataSource: { query: jest.Mock };
  let auditService: { emit: jest.Mock };
  let orgService: jest.Mocked<Pick<OrgService, 'isSubordinateTo' | 'getDescendants'>>;
  let eventEmitter: { emit: jest.Mock };
  let outboxService: { publish: jest.Mock };

  beforeEach(() => {
    taskRepo       = mockRepo<Task>();
    typeRepo       = mockRepo<TaskType>();
    assignmentRepo = mockRepo<TaskAssignment>();
    historyRepo    = mockRepo<TaskHistory>();
    commentRepo    = mockRepo<TaskComment>();
    attachmentRepo = mockRepo<TaskAttachment>();
    dataSource     = { query: jest.fn().mockResolvedValue([]) };
    auditService   = { emit: jest.fn().mockResolvedValue(undefined) };
    orgService     = {
      isSubordinateTo: jest.fn().mockResolvedValue(true),
      getDescendants:  jest.fn().mockResolvedValue([]),
    };
    eventEmitter   = { emit: jest.fn() };
    outboxService  = { publish: jest.fn().mockResolvedValue({ id: 'outbox-1', status: 'dispatched' }) };

    service = new TasksService(
      taskRepo       as any,
      typeRepo       as any,
      assignmentRepo as any,
      historyRepo    as any,
      commentRepo    as any,
      attachmentRepo as any,
      dataSource     as unknown as DataSource,
      auditService   as unknown as AuditService,
      orgService     as unknown as OrgService,
      eventEmitter   as unknown as EventEmitter2,
      outboxService  as unknown as OutboxService,
    );
  });

  // ── createTask ────────────────────────────────────────────────────────────────

  describe('createTask', () => {
    const baseDto = {
      typeId: 'type-1',
      title: 'Assess bridge structural integrity',
      responsiblePositionId: 'pos-executor',
    };

    it('throws NotFoundException when task type is not found', async () => {
      typeRepo.findOne.mockResolvedValue(null);

      await expect(service.createTask(baseDto, 'user-1', 'pos-supervisor')).rejects.toThrow(NotFoundException);
    });

    it('throws ForbiddenException when actor has no assignment authority over target position', async () => {
      typeRepo.findOne.mockResolvedValue(makeTaskType());
      orgService.isSubordinateTo.mockResolvedValue(false);

      await expect(service.createTask(baseDto, 'user-1', 'pos-other')).rejects.toThrow(ForbiddenException);
    });

    it('allows self-assignment without command-chain check', async () => {
      typeRepo.findOne.mockResolvedValue(makeTaskType());
      // When assigner === responsible, no authority check (same position ID)
      taskRepo.findOne.mockResolvedValue(makeTask({ status: TaskStatus.DRAFT }));

      await service.createTask(
        { ...baseDto, responsiblePositionId: 'pos-self' },
        'user-1',
        'pos-self',
      );

      // orgService.isSubordinateTo should NOT be called when self-assigning
      expect(orgService.isSubordinateTo).not.toHaveBeenCalledWith('pos-self', 'pos-self');
    });

    it('creates DRAFT task when taskType.supportsDraft=true', async () => {
      typeRepo.findOne.mockResolvedValue(makeTaskType({ supportsDraft: true }));
      taskRepo.findOne.mockResolvedValue(makeTask({ status: TaskStatus.DRAFT }));

      await service.createTask(baseDto, 'user-1', 'pos-supervisor');

      const created = taskRepo.create.mock.calls[0][0] as Partial<Task>;
      expect(created.status).toBe(TaskStatus.DRAFT);
    });

    it('creates ASSIGNED task directly when taskType.supportsDraft=false', async () => {
      typeRepo.findOne.mockResolvedValue(makeTaskType({ supportsDraft: false }));
      taskRepo.findOne.mockResolvedValue(makeTask({ status: TaskStatus.ASSIGNED }));

      await service.createTask(baseDto, 'user-1', 'pos-supervisor');

      const created = taskRepo.create.mock.calls[0][0] as Partial<Task>;
      expect(created.status).toBe(TaskStatus.ASSIGNED);
    });

    it('throws NotFoundException when parentTaskId references a non-existent task', async () => {
      typeRepo.findOne.mockResolvedValue(makeTaskType());
      taskRepo.findOne.mockResolvedValue(null);  // parent not found

      await expect(
        service.createTask({ ...baseDto, parentTaskId: 'nonexistent' }, 'user-1', 'pos-supervisor'),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequestException when MAX_SUBTASK_DEPTH is reached', async () => {
      typeRepo.findOne.mockResolvedValue(makeTaskType({ supportsSubtasks: true }));
      // Parent task is already at depth 3 (the maximum)
      taskRepo.findOne
        .mockResolvedValueOnce(makeTask({ depth: 3, responsiblePositionId: 'pos-executor' }));

      await expect(
        service.createTask(
          { ...baseDto, parentTaskId: 'parent-task', responsiblePositionId: 'pos-executor' },
          'user-1',
          'pos-executor',  // actor is primary executor of parent
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException when taskType does not support subtasks', async () => {
      typeRepo.findOne.mockResolvedValue(makeTaskType({ supportsSubtasks: false }));
      taskRepo.findOne.mockResolvedValue(makeTask({ depth: 0 }));

      await expect(
        service.createTask({ ...baseDto, parentTaskId: 'parent-1' }, 'user-1', 'pos-supervisor'),
      ).rejects.toThrow(BadRequestException);
    });

    it('emits task.created event on success', async () => {
      typeRepo.findOne.mockResolvedValue(makeTaskType());
      taskRepo.findOne.mockResolvedValue(makeTask());

      await service.createTask(baseDto, 'user-1', 'pos-supervisor');

      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'task.created',
        expect.objectContaining({ actorId: 'user-1' }),
      );
    });

    it('creates co-executor assignments when provided and type supports them', async () => {
      typeRepo.findOne.mockResolvedValue(makeTaskType({ supportsCoExecutors: true }));
      taskRepo.findOne.mockResolvedValue(makeTask());

      await service.createTask(
        {
          ...baseDto,
          coExecutors: [{ positionId: 'pos-coex-1' }, { positionId: 'pos-coex-2' }],
        },
        'user-1',
        'pos-supervisor',
      );

      const assignmentTypes = assignmentRepo.create.mock.calls.map(
        (c) => (c[0] as Partial<TaskAssignment>).assignmentType,
      );
      expect(assignmentTypes.filter((t) => t === AssignmentType.CO_EXECUTOR)).toHaveLength(2);
    });
  });

  // ── transitionStatus ──────────────────────────────────────────────────────────

  describe('transitionStatus', () => {
    const baseDtoAccept = { targetStatus: TaskStatus.ACCEPTED };

    it('throws NotFoundException when task does not exist', async () => {
      taskRepo.findOne.mockResolvedValue(null);

      await expect(
        service.transitionStatus('task-x', baseDtoAccept, 'user-1', 'pos-executor', 3),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequestException for invalid state machine transition', async () => {
      taskRepo.findOne.mockResolvedValue(
        makeTask({ status: TaskStatus.COMPLETED }),
      );

      // COMPLETED → ACCEPTED is not in TASK_TRANSITIONS
      await expect(
        service.transitionStatus('task-1', { targetStatus: TaskStatus.ACCEPTED }, 'user-1', 'pos-executor', 3),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws ForbiddenException when non-executor tries to ACCEPT', async () => {
      taskRepo.findOne.mockResolvedValue(
        makeTask({ status: TaskStatus.ASSIGNED, responsiblePositionId: 'pos-executor' }),
      );
      orgService.isSubordinateTo.mockResolvedValue(false);

      await expect(
        service.transitionStatus('task-1', baseDtoAccept, 'user-1', 'pos-other', 3),
      ).rejects.toThrow(ForbiddenException);
    });

    it('requires reason for ON_HOLD transition', async () => {
      taskRepo.findOne.mockResolvedValue(
        makeTask({ status: TaskStatus.ACCEPTED, responsiblePositionId: 'pos-executor' }),
      );

      await expect(
        service.transitionStatus(
          'task-1',
          { targetStatus: TaskStatus.ON_HOLD },  // no reason
          'user-1',
          'pos-executor',
          3,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('requires completionReport for COMPLETED transition', async () => {
      taskRepo.findOne.mockResolvedValue(
        makeTask({ status: TaskStatus.IN_PROGRESS, responsiblePositionId: 'pos-executor' }),
      );

      await expect(
        service.transitionStatus(
          'task-1',
          { targetStatus: TaskStatus.COMPLETED },  // no completionReport
          'user-1',
          'pos-executor',
          3,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('sets completedAt and progressPercent=100 on COMPLETED transition', async () => {
      taskRepo.findOne.mockResolvedValue(
        makeTask({ status: TaskStatus.IN_PROGRESS, responsiblePositionId: 'pos-executor' }),
      );

      const result = await service.transitionStatus(
        'task-1',
        { targetStatus: TaskStatus.COMPLETED, completionReport: 'Flood survey completed.' },
        'user-1',
        'pos-executor',
        3,
      );

      expect(result.completedAt).toBeInstanceOf(Date);
      expect(result.progressPercent).toBe(100);
      expect(result.completionReport).toBe('Flood survey completed.');
    });

    it('emits task.status_changed event on success', async () => {
      taskRepo.findOne.mockResolvedValue(
        makeTask({ status: TaskStatus.ASSIGNED, responsiblePositionId: 'pos-executor' }),
      );
      assignmentRepo.findOne.mockResolvedValue(makeAssignment());

      await service.transitionStatus(
        'task-1',
        { targetStatus: TaskStatus.ACCEPTED },
        'user-1',
        'pos-executor',
        3,
      );

      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'task.status_changed',
        expect.objectContaining({ from: TaskStatus.ASSIGNED, to: TaskStatus.ACCEPTED }),
      );
    });

    it('writes task.channel_requested to the outbox when transitioning DRAFT → ASSIGNED', async () => {
      taskRepo.findOne.mockResolvedValue(
        makeTask({
          status: TaskStatus.DRAFT,
          assigningPositionId: 'pos-supervisor',  // actor is assigning authority
        }),
      );
      orgService.isSubordinateTo.mockResolvedValue(true);  // supervisor check

      await service.transitionStatus(
        'task-1',
        { targetStatus: TaskStatus.ASSIGNED },
        'user-supervisor',
        'pos-supervisor',
        3,
      );

      expect(outboxService.publish).toHaveBeenCalledWith(
        'task.channel_requested',
        expect.objectContaining({ taskId: 'task-1' }),
        expect.objectContaining({ source: 'tasks', aggregateType: 'task', aggregateId: 'task-1' }),
      );
    });

    it('propagates to parent when parentTaskId is set and all subtasks are done', async () => {
      const childTask = makeTask({
        status: TaskStatus.IN_PROGRESS,
        responsiblePositionId: 'pos-executor',
        parentTaskId: 'parent-task',
      });
      taskRepo.findOne
        .mockResolvedValueOnce(childTask)                   // getTask in transitionStatus
        .mockResolvedValueOnce(makeTask({ id: 'parent-task', status: TaskStatus.IN_PROGRESS })); // propagateToParent parent lookup

      taskRepo.find.mockResolvedValue([
        makeTask({ id: 'child-1', status: TaskStatus.COMPLETED }),
        makeTask({ id: 'child-2', status: TaskStatus.COMPLETED }),
      ]);

      await service.transitionStatus(
        'task-1',
        { targetStatus: TaskStatus.COMPLETED, completionReport: 'Done' },
        'user-1',
        'pos-executor',
        3,
      );

      expect(outboxService.publish).toHaveBeenCalledWith(
        'notification.requested',
        expect.objectContaining({ type: 'TASK_ALL_SUBTASKS_COMPLETE' }),
        expect.objectContaining({ source: 'tasks', aggregateType: 'task', aggregateId: 'parent-task' }),
      );
    });
  });

  // ── updateTask ────────────────────────────────────────────────────────────────

  describe('updateTask', () => {
    it('updates mutable fields and emits task.updated', async () => {
      const task = makeTask({ status: TaskStatus.ASSIGNED });
      taskRepo.findOne.mockResolvedValue(task);
      taskRepo.save.mockImplementation(async (entity: Task) => entity);

      const result = await service.updateTask(
        'task-1',
        { title: 'Updated title', description: 'Updated description' } as any,
        'user-1',
        'pos-supervisor',
        3,
      );

      expect(taskRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Updated title',
          description: 'Updated description',
        }),
      );
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'task.updated',
        expect.objectContaining({ taskId: 'task-1', actorId: 'user-1' }),
      );
      expect(result.title).toBe('Updated title');
    });
  });

  // ── markOverdueTasks ──────────────────────────────────────────────────────────

  describe('markOverdueTasks', () => {
    it('returns 0 when no tasks are past their deadline', async () => {
      const qb = (taskRepo as any)._qb;
      qb.getMany.mockResolvedValue([]);

      const count = await service.markOverdueTasks();

      expect(count).toBe(0);
      expect(taskRepo.save).not.toHaveBeenCalled();
    });

    it('marks overdue tasks and emits task.overdue per task', async () => {
      const overdueTask1 = makeTask({ id: 'od-1', deadline: '2025-12-01' as any });
      const overdueTask2 = makeTask({ id: 'od-2', deadline: '2025-11-01' as any });

      const qb = (taskRepo as any)._qb;
      qb.getMany.mockResolvedValue([overdueTask1, overdueTask2]);

      const count = await service.markOverdueTasks();

      expect(count).toBe(2);
      expect(taskRepo.save).toHaveBeenCalledTimes(2);
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'task.overdue',
        expect.objectContaining({ taskId: 'od-1' }),
      );
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'task.overdue',
        expect.objectContaining({ taskId: 'od-2' }),
      );
    });

    it('sets isOverdue=true and overdueAt on each flagged task', async () => {
      const task = makeTask({ isOverdue: false });
      const qb = (taskRepo as any)._qb;
      qb.getMany.mockResolvedValue([task]);

      await service.markOverdueTasks();

      const saved = (taskRepo.save as jest.Mock).mock.calls[0][0] as Task;
      expect(saved.isOverdue).toBe(true);
      expect(saved.overdueAt).toBeInstanceOf(Date);
    });
  });

  // ── listTasksForSupervisor ────────────────────────────────────────────────────

  describe('listTasksForSupervisor', () => {
    it('returns empty result when supervisor has no subordinate positions', async () => {
      dataSource.query.mockResolvedValue([]);  // no subordinates

      const result = await service.listTasksForSupervisor('pos-super', 3);

      expect(result).toEqual({ data: [], total: 0 });
      expect(taskRepo.createQueryBuilder).not.toHaveBeenCalled();
    });

    it('queries tasks restricted to subordinate positions', async () => {
      dataSource.query.mockResolvedValue([{ id: 'pos-sub-1' }, { id: 'pos-sub-2' }]);

      const qb = (taskRepo as any)._qb;
      qb.getManyAndCount.mockResolvedValue([[makeTask()], 1]);

      const result = await service.listTasksForSupervisor('pos-super', 3);

      expect(result.total).toBe(1);
      expect(qb.andWhere).toHaveBeenCalledWith(
        'task.responsiblePositionId IN (:...positions)',
        expect.objectContaining({ positions: ['pos-sub-1', 'pos-sub-2'] }),
      );
    });
  });

  // ── updateProgress ────────────────────────────────────────────────────────────

  describe('updateProgress', () => {
    it('throws NotFoundException when task does not exist', async () => {
      taskRepo.findOne.mockResolvedValue(null);

      await expect(
        service.updateProgress('task-x', { progressPercent: 50 }, 'user-1', 'pos-1', 3),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws ForbiddenException when actor is not a task participant', async () => {
      taskRepo.findOne.mockResolvedValue(makeTask());
      assignmentRepo.findOne.mockResolvedValue(null);  // not a participant

      await expect(
        service.updateProgress('task-1', { progressPercent: 40 }, 'user-1', 'pos-outsider', 3),
      ).rejects.toThrow(ForbiddenException);
    });

    it('updates progressPercent and records history on success', async () => {
      taskRepo.findOne.mockResolvedValue(makeTask({ progressPercent: 20 }));
      assignmentRepo.findOne.mockResolvedValue(makeAssignment({ positionId: 'pos-executor' }));

      const result = await service.updateProgress(
        'task-1',
        { progressPercent: 75, progressNote: 'Phase 2 complete' },
        'user-1',
        'pos-executor',
        3,
      );

      expect(result.progressPercent).toBe(75);
      expect(result.progressNote).toBe('Phase 2 complete');
      expect(historyRepo.save).toHaveBeenCalledTimes(1);
    });
  });

  // ── TASK_TRANSITIONS state machine ────────────────────────────────────────────

  describe('getComments', () => {
    it('throws ForbiddenException when actor is neither participant nor supervisor', async () => {
      taskRepo.findOne.mockResolvedValue(
        makeTask({ assigningPositionId: 'pos-supervisor', responsiblePositionId: 'pos-executor' }),
      );
      assignmentRepo.findOne.mockResolvedValue(null);
      orgService.isSubordinateTo.mockResolvedValue(false);

      await expect(
        service.getComments('task-1', 'pos-outsider', 3, true),
      ).rejects.toThrow(ForbiddenException);
    });

    it('returns comments for a task participant', async () => {
      taskRepo.findOne.mockResolvedValue(makeTask());
      assignmentRepo.findOne.mockResolvedValue(makeAssignment({ positionId: 'pos-executor' }));
      (commentRepo as any)._qb.getMany.mockResolvedValue([
        { id: 'comment-1', taskId: 'task-1', body: 'Status update', isInternal: false },
      ]);

      const result = await service.getComments('task-1', 'pos-executor', 3, true);

      expect(result).toHaveLength(1);
      expect(commentRepo.createQueryBuilder).toHaveBeenCalledWith('c');
    });
  });

  describe('removeAttachment', () => {
    it('throws ForbiddenException when actor is neither participant nor supervisor', async () => {
      taskRepo.findOne.mockResolvedValue(
        makeTask({ assigningPositionId: 'pos-supervisor', responsiblePositionId: 'pos-executor' }),
      );
      assignmentRepo.findOne.mockResolvedValue(null);
      orgService.isSubordinateTo.mockResolvedValue(false);

      await expect(
        service.removeAttachment('task-1', 'attach-1', 'user-1', 'pos-outsider', 3),
      ).rejects.toThrow(ForbiddenException);
    });

    it('soft-removes attachment for a task participant', async () => {
      taskRepo.findOne.mockResolvedValue(makeTask());
      assignmentRepo.findOne.mockResolvedValue(makeAssignment({ positionId: 'pos-executor' }));
      attachmentRepo.findOne.mockResolvedValue({
        id: 'attach-1',
        taskId: 'task-1',
        fileId: 'file-1',
        fileName: 'report.pdf',
        removedAt: null,
      } as any);

      await service.removeAttachment('task-1', 'attach-1', 'user-1', 'pos-executor', 3);

      expect(attachmentRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ removedAt: expect.any(Date) }),
      );
    });
  });

  describe('TASK_TRANSITIONS state machine (invariant check)', () => {
    it('DRAFT → ASSIGNED is a valid transition', () => {
      expect(TASK_TRANSITIONS[TaskStatus.DRAFT]).toContain(TaskStatus.ASSIGNED);
    });

    it('COMPLETED → VERIFIED is a valid transition', () => {
      expect(TASK_TRANSITIONS[TaskStatus.COMPLETED]).toContain(TaskStatus.VERIFIED);
    });

    it('COMPLETED → ACCEPTED is NOT a valid transition', () => {
      expect(TASK_TRANSITIONS[TaskStatus.COMPLETED]).not.toContain(TaskStatus.ACCEPTED);
    });

    it('VERIFIED → CLOSED is the only valid transition from VERIFIED', () => {
      expect(TASK_TRANSITIONS[TaskStatus.VERIFIED]).toEqual([TaskStatus.CLOSED]);
    });

    it('IN_PROGRESS allows COMPLETED, ON_HOLD, CANNOT_EXECUTE, CANCELLED', () => {
      expect(TASK_TRANSITIONS[TaskStatus.IN_PROGRESS]).toEqual(
        expect.arrayContaining([
          TaskStatus.COMPLETED,
          TaskStatus.ON_HOLD,
          TaskStatus.CANNOT_EXECUTE,
          TaskStatus.CANCELLED,
        ]),
      );
    });
  });
});
