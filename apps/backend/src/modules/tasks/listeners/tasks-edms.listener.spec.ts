/**
 * 2.2.4 — Cross-domain integration tests
 *
 * Tests the two cross-domain event bridges:
 *  1. TasksEdmsListener — EDMS resolution → Task creation
 *  2. ChatDomainListener — Task/EDMS events → Channel management
 *
 * Both listeners are tested in isolation with mocked dependencies to verify
 * the correct domain handoffs without needing a live DB or message broker.
 */
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';

import { TasksEdmsListener } from './tasks-edms.listener';
import { Task, TaskStatus, TaskPriority, TaskSource } from '../entities/task.entity';
import { TaskType } from '../entities/task-type.entity';
import { TaskAssignment } from '../entities/task-assignment.entity';
import { TaskHistory } from '../entities/task-history.entity';
import { AuditService } from '../../audit/services/audit.service';

// ─── helpers ────────────────────────────────────────────────────────────────

const makeTaskRepo = () => ({
  create: jest.fn((d) => ({ id: 'task-new', ...d })),
  save:   jest.fn(async (d) => d),
  findOne: jest.fn(),
});

const makeRepo = () => ({
  create: jest.fn((d) => ({ id: 'rec-new', ...d })),
  save:   jest.fn(async (d) => d),
  findOne: jest.fn(),
});

const RESOLUTION_PAYLOAD = {
  documentId:       'doc-1',
  resolutionId:     'res-1',
  issuingPositionId: 'pos-head',
  issuingUserId:    'user-head',
  text:             'Review seismic damage report and submit findings',
  priority:         'urgent',
  deadline:         '2026-05-01',
  assignments: [
    {
      assignmentId:   'asgn-1',
      positionId:     'pos-officer',
      assignedUserId: 'user-officer',
      executorRole:   'executor',
      instruction:    'Analyse sector 3',
      deadline:       '2026-04-20',
    },
    {
      assignmentId:   'asgn-2',
      positionId:     'pos-deputy',
      assignedUserId: null,
      executorRole:   'co_executor',
      instruction:    null,
      deadline:       null,
    },
  ],
};

// ─── TasksEdmsListener tests ─────────────────────────────────────────────────

describe('TasksEdmsListener — EDMS resolution → Tasks (2.2.4)', () => {
  let listener: TasksEdmsListener;
  let taskRepo: ReturnType<typeof makeTaskRepo>;
  let typeRepo: ReturnType<typeof makeRepo>;
  let assignmentRepo: ReturnType<typeof makeRepo>;
  let historyRepo: ReturnType<typeof makeRepo>;
  let auditService: jest.Mocked<AuditService>;
  let eventEmitter: jest.Mocked<EventEmitter2>;
  let inboxService: { executeOnce: jest.Mock };

  beforeEach(async () => {
    taskRepo       = makeTaskRepo();
    typeRepo       = makeRepo();
    assignmentRepo = makeRepo();
    historyRepo    = makeRepo();
    auditService   = { emit: jest.fn().mockResolvedValue(undefined), log: jest.fn() } as any;
    eventEmitter   = { emit: jest.fn() } as any;
    inboxService   = {
      executeOnce: jest.fn().mockImplementation(async (_consumer, _eventType, _payload, handler) => {
        await handler();
        return true;
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TasksEdmsListener,
        { provide: getRepositoryToken(Task),           useValue: taskRepo },
        { provide: getRepositoryToken(TaskType),       useValue: typeRepo },
        { provide: getRepositoryToken(TaskAssignment), useValue: assignmentRepo },
        { provide: getRepositoryToken(TaskHistory),    useValue: historyRepo },
        { provide: AuditService,   useValue: auditService },
        { provide: EventEmitter2,  useValue: eventEmitter },
        { provide: InboxService,   useValue: inboxService },
      ],
    }).compile();

    listener = module.get(TasksEdmsListener);
  });

  describe('onResolutionIssued', () => {
    it('creates one Task per executor assignment', async () => {
      typeRepo.findOne.mockResolvedValue({ id: 'type-doc', name: 'Document-Generated Task', active: true });

      await listener.onResolutionIssued(RESOLUTION_PAYLOAD);

      expect(inboxService.executeOnce).toHaveBeenCalled();
      expect(taskRepo.save).toHaveBeenCalledTimes(2);
    });

    it('skips duplicate resolution payload when inbox reports already processed', async () => {
      inboxService.executeOnce.mockResolvedValue(false);
      typeRepo.findOne.mockResolvedValue({ id: 'type-doc', name: 'Document-Generated Task', active: true });

      await listener.onResolutionIssued(RESOLUTION_PAYLOAD);

      expect(taskRepo.save).not.toHaveBeenCalled();
      expect(eventEmitter.emit).not.toHaveBeenCalled();
    });

    it('maps priority "urgent" → TaskPriority.HIGH', async () => {
      typeRepo.findOne.mockResolvedValue({ id: 'type-doc', active: true });

      await listener.onResolutionIssued(RESOLUTION_PAYLOAD);

      const [firstCall] = taskRepo.create.mock.calls;
      expect(firstCall[0].priority).toBe(TaskPriority.HIGH);
    });

    it('maps priority "emergency" → TaskPriority.CRITICAL', async () => {
      typeRepo.findOne.mockResolvedValue({ id: 'type-doc', active: true });

      await listener.onResolutionIssued({ ...RESOLUTION_PAYLOAD, priority: 'emergency' });

      expect(taskRepo.create.mock.calls[0][0].priority).toBe(TaskPriority.CRITICAL);
    });

    it('sets source = DOCUMENT_GENERATED and links sourceDocumentId + sourceResolutionId', async () => {
      typeRepo.findOne.mockResolvedValue({ id: 'type-doc', active: true });

      await listener.onResolutionIssued(RESOLUTION_PAYLOAD);

      const createdTask = taskRepo.create.mock.calls[0][0];
      expect(createdTask.source).toBe(TaskSource.DOCUMENT_GENERATED);
      expect(createdTask.sourceDocumentId).toBe('doc-1');
      expect(createdTask.sourceResolutionId).toBe('res-1');
    });

    it('status is ASSIGNED on creation', async () => {
      typeRepo.findOne.mockResolvedValue({ id: 'type-doc', active: true });

      await listener.onResolutionIssued(RESOLUTION_PAYLOAD);

      expect(taskRepo.create.mock.calls[0][0].status).toBe(TaskStatus.ASSIGNED);
    });

    it('creates a TaskAssignment per executor', async () => {
      typeRepo.findOne.mockResolvedValue({ id: 'type-doc', active: true });

      await listener.onResolutionIssued(RESOLUTION_PAYLOAD);

      expect(assignmentRepo.save).toHaveBeenCalledTimes(2);
    });

    it('records task creation in TaskHistory', async () => {
      typeRepo.findOne.mockResolvedValue({ id: 'type-doc', active: true });

      await listener.onResolutionIssued(RESOLUTION_PAYLOAD);

      expect(historyRepo.save).toHaveBeenCalledTimes(2);
      const histEntry = historyRepo.create.mock.calls[0][0];
      expect(histEntry.eventType).toBe('task_created_from_resolution');
    });

    it('emits tasks.edms_task_created for each assignment', async () => {
      typeRepo.findOne.mockResolvedValue({ id: 'type-doc', active: true });

      await listener.onResolutionIssued(RESOLUTION_PAYLOAD);

      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'tasks.edms_task_created',
        expect.objectContaining({ documentId: 'doc-1' }),
      );
      expect(eventEmitter.emit).toHaveBeenCalledTimes(2);
    });

    it('auto-creates a TaskType when none exists', async () => {
      typeRepo.findOne.mockResolvedValueOnce(null); // no type found
      typeRepo.save.mockResolvedValue({ id: 'type-new', name: 'Document-Generated Task', active: true });
      typeRepo.findOne.mockResolvedValueOnce(null); // second findOne also returns null

      await listener.onResolutionIssued({ ...RESOLUTION_PAYLOAD, assignments: [RESOLUTION_PAYLOAD.assignments[0]] });

      expect(typeRepo.save).toHaveBeenCalled();
      expect(taskRepo.save).toHaveBeenCalled();
    });

    it('does NOT throw when TaskType is unavailable — logs and returns gracefully', async () => {
      typeRepo.findOne.mockResolvedValue(null);
      typeRepo.save.mockRejectedValue(new Error('unique violation'));
      typeRepo.findOne.mockResolvedValue(null); // fallback also null

      await expect(listener.onResolutionIssued(RESOLUTION_PAYLOAD)).resolves.not.toThrow();
    });

    it('never throws — swallows unexpected errors', async () => {
      typeRepo.findOne.mockRejectedValue(new Error('DB connection lost'));

      await expect(listener.onResolutionIssued(RESOLUTION_PAYLOAD)).resolves.not.toThrow();
    });

    it('truncates very long resolution text to 200 chars for task title', async () => {
      typeRepo.findOne.mockResolvedValue({ id: 'type-doc', active: true });
      const longText = 'A'.repeat(250);

      await listener.onResolutionIssued({
        ...RESOLUTION_PAYLOAD,
        text: longText,
        assignments: [RESOLUTION_PAYLOAD.assignments[0]],
      });

      const title = taskRepo.create.mock.calls[0][0].title as string;
      expect(title.length).toBeLessThanOrEqual(200);
      expect(title.endsWith('...')).toBe(true);
    });
  });

  // ── Reverse direction: task.status_changed → EDMS ─────────────────────────

  describe('onTaskStatusChanged', () => {
    it('emits tasks.document_task_completed when a DOCUMENT_GENERATED task completes', async () => {
      const task = {
        id: 'task-doc',
        source: TaskSource.DOCUMENT_GENERATED,
        sourceDocumentId: 'doc-1',
        sourceResolutionId: 'res-1',
        responsiblePositionId: 'pos-officer',
        completionReport: 'All done',
      };
      taskRepo.findOne.mockResolvedValue(task);

      await listener.onTaskStatusChanged({
        taskId: 'task-doc',
        from: TaskStatus.IN_PROGRESS,
        to: TaskStatus.COMPLETED,
        actorId: 'user-1',
        actorPositionId: 'pos-officer',
      });

      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'tasks.document_task_completed',
        expect.objectContaining({ sourceDocumentId: 'doc-1' }),
      );
    });

    it('does nothing for non-DOCUMENT_GENERATED tasks', async () => {
      const task = { id: 'task-manual', source: TaskSource.MANUAL, sourceDocumentId: null };
      taskRepo.findOne.mockResolvedValue(task);

      await listener.onTaskStatusChanged({
        taskId: 'task-manual',
        from: TaskStatus.IN_PROGRESS,
        to: TaskStatus.COMPLETED,
        actorId: 'user-1',
        actorPositionId: 'pos-1',
      });

      expect(eventEmitter.emit).not.toHaveBeenCalled();
    });

    it('does nothing when status is not COMPLETED or VERIFIED', async () => {
      await listener.onTaskStatusChanged({
        taskId: 'task-1',
        from: TaskStatus.ASSIGNED,
        to: TaskStatus.IN_PROGRESS,
        actorId: 'user-1',
        actorPositionId: 'pos-1',
      });

      expect(taskRepo.findOne).not.toHaveBeenCalled();
      expect(eventEmitter.emit).not.toHaveBeenCalled();
    });
  });
});

// ─── ChatDomainListener cross-domain tests ───────────────────────────────────

import { ChatDomainListener } from '../../chat/listeners/chat-domain.listener';
import { ChatService } from '../../chat/services/chat.service';
import { PresenceService, PresenceStatus } from '../../chat/services/presence.service';
import { ChannelType } from '../../chat/entities/channel.entity';
import { InboxService } from '../../inbox/services/inbox.service';

describe('ChatDomainListener — Task/EDMS → Chat channels (2.2.4)', () => {
  let listener: ChatDomainListener;
  let chatService: jest.Mocked<ChatService>;
  let presenceService: jest.Mocked<PresenceService>;
  let inboxService: { executeOnce: jest.Mock };

  beforeEach(async () => {
    chatService = {
      createLinkedChannel: jest.fn().mockResolvedValue({ id: 'chan-new' }),
      setChannelReadOnly:  jest.fn().mockResolvedValue(undefined),
      channelRepo: { findOne: jest.fn() },
      addMember: jest.fn().mockResolvedValue(undefined),
    } as any;

    presenceService = {
      setPresence: jest.fn().mockResolvedValue(undefined),
    } as any;
    inboxService = {
      executeOnce: jest.fn().mockImplementation(async (_consumer, _eventType, _payload, handler) => {
        await handler();
        return true;
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ChatDomainListener,
        { provide: ChatService,    useValue: chatService },
        { provide: PresenceService, useValue: presenceService },
        { provide: InboxService, useValue: inboxService },
      ],
    }).compile();

    listener = module.get(ChatDomainListener);
  });

  // ── task.channel_requested ─────────────────────────────────────────────────

  describe('onTaskChannelRequested', () => {
    it('creates a TASK_LINKED channel with both position IDs as members', async () => {
      await listener.onTaskChannelRequested({
        taskId: 'task-1',
        taskTitle: 'Inspect Building 7',
        responsiblePositionId: 'pos-a',
        assigningPositionId: 'pos-b',
      });

      expect(inboxService.executeOnce).toHaveBeenCalled();
      expect(chatService.createLinkedChannel).toHaveBeenCalledWith(
        expect.objectContaining({
          type: ChannelType.TASK_LINKED,
          linkedEntityId: 'task-1',
          linkedEntityType: 'task',
          memberPositionIds: expect.arrayContaining(['pos-a', 'pos-b']),
        }),
      );
    });

    it('deduplicates when responsiblePositionId === assigningPositionId', async () => {
      await listener.onTaskChannelRequested({
        taskId: 'task-2',
        taskTitle: 'Self-assigned',
        responsiblePositionId: 'pos-same',
        assigningPositionId: 'pos-same',
      });

      const call = chatService.createLinkedChannel.mock.calls[0][0];
      expect(call.memberPositionIds).toHaveLength(1);
    });

    it('truncates task title to 100 chars in channel name', async () => {
      const longTitle = 'B'.repeat(150);

      await listener.onTaskChannelRequested({
        taskId: 'task-3',
        taskTitle: longTitle,
        responsiblePositionId: 'pos-a',
        assigningPositionId: 'pos-b',
      });

      const call = chatService.createLinkedChannel.mock.calls[0][0];
      expect(call.name.length).toBeLessThanOrEqual(107); // 'Task: ' (6) + 100 chars + safety
    });

    it('swallows errors without throwing', async () => {
      chatService.createLinkedChannel.mockRejectedValue(new Error('DB error'));

      await expect(
        listener.onTaskChannelRequested({
          taskId: 'task-fail',
          taskTitle: 'Failing task',
          responsiblePositionId: 'pos-a',
          assigningPositionId: 'pos-b',
        }),
      ).resolves.not.toThrow();
    });

    it('skips duplicate task-channel request when inbox reports already processed', async () => {
      inboxService.executeOnce.mockResolvedValue(false);

      await listener.onTaskChannelRequested({
        taskId: 'task-dup',
        taskTitle: 'Duplicate task',
        responsiblePositionId: 'pos-a',
        assigningPositionId: 'pos-b',
      });

      expect(chatService.createLinkedChannel).not.toHaveBeenCalled();
    });
  });

  // ── task.status_changed → read-only ───────────────────────────────────────

  describe('onTaskStatusChanged', () => {
    it('makes task channel read-only on CLOSED', async () => {
      await listener.onTaskStatusChanged({ taskId: 'task-1', from: 'in_progress', to: 'closed' });

      expect(chatService.setChannelReadOnly).toHaveBeenCalledWith('task-1', 'task');
    });

    it('makes task channel read-only on CANCELLED', async () => {
      await listener.onTaskStatusChanged({ taskId: 'task-1', from: 'assigned', to: 'cancelled' });

      expect(chatService.setChannelReadOnly).toHaveBeenCalledWith('task-1', 'task');
    });

    it('does NOT modify channel for non-terminal statuses', async () => {
      await listener.onTaskStatusChanged({ taskId: 'task-1', from: 'assigned', to: 'in_progress' });

      expect(chatService.setChannelReadOnly).not.toHaveBeenCalled();
    });
  });

  // ── edms.document.registered ──────────────────────────────────────────────

  describe('onDocumentRegistered', () => {
    it('creates a DOCUMENT_LINKED channel on document registration', async () => {
      await listener.onDocumentRegistered({
        documentId: 'doc-1',
        registrationNumber: 'ОИ-2026/0042',
        actorId: 'user-1',
      });

      expect(chatService.createLinkedChannel).toHaveBeenCalledWith(
        expect.objectContaining({
          type: ChannelType.DOCUMENT_LINKED,
          linkedEntityId: 'doc-1',
          linkedEntityType: 'document',
          name: expect.stringContaining('ОИ-2026/0042'),
        }),
      );
    });

    it('swallows errors without throwing', async () => {
      chatService.createLinkedChannel.mockRejectedValue(new Error('Channel already exists'));

      await expect(
        listener.onDocumentRegistered({ documentId: 'doc-fail', registrationNumber: 'X-1', actorId: 'u' }),
      ).resolves.not.toThrow();
    });

    it('skips duplicate document-channel request when inbox reports already processed', async () => {
      inboxService.executeOnce.mockResolvedValue(false);

      await listener.onDocumentRegistered({ documentId: 'doc-dup', registrationNumber: 'X-1', actorId: 'u' });

      expect(chatService.createLinkedChannel).not.toHaveBeenCalled();
    });
  });

  // ── workflow.completed ────────────────────────────────────────────────────

  describe('onWorkflowCompleted', () => {
    it('makes document channel read-only on workflow completion', async () => {
      await listener.onWorkflowCompleted({ documentId: 'doc-1' });

      expect(chatService.setChannelReadOnly).toHaveBeenCalledWith('doc-1', 'document');
    });
  });

  // ── iam.user_logged_out → presence ────────────────────────────────────────

  describe('onUserLoggedOut', () => {
    it('sets user presence to OFFLINE on logout', async () => {
      await listener.onUserLoggedOut({ userId: 'user-1' });

      expect(presenceService.setPresence).toHaveBeenCalledWith('user-1', PresenceStatus.OFFLINE);
    });

    it('swallows presence errors', async () => {
      presenceService.setPresence.mockRejectedValue(new Error('Redis down'));

      await expect(listener.onUserLoggedOut({ userId: 'user-1' })).resolves.not.toThrow();
    });
  });
});
