import {
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { Repository, DataSource } from 'typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';

import { ChatService } from './chat.service';
import { Channel, ChannelType, ChannelStatus } from '../entities/channel.entity';
import { ChannelMember, MemberRole, MemberStatus } from '../entities/channel-member.entity';
import { Message, MessageType } from '../entities/message.entity';
import { MessageEdit } from '../entities/message-edit.entity';
import { AuditService } from '../../audit/services/audit.service';

// ── Mock helpers ───────────────────────────────────────────────────────────────

function mockRepo<T>(): jest.Mocked<Repository<T>> {
  return {
    create: jest.fn((dto: Partial<T>) => ({ id: 'generated-id', ...dto }) as T),
    save: jest.fn().mockImplementation(async (entity: T) => entity),
    find: jest.fn().mockResolvedValue([]),
    findOne: jest.fn().mockResolvedValue(null),
    update: jest.fn().mockResolvedValue({ affected: 1 }),
    increment: jest.fn().mockResolvedValue({ affected: 1 }),
    createQueryBuilder: jest.fn().mockReturnValue({
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      innerJoin: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      delete: jest.fn().mockReturnThis(),
      execute: jest.fn().mockResolvedValue({ affected: 0 }),
      getMany: jest.fn().mockResolvedValue([]),
      getOne: jest.fn().mockResolvedValue(null),
    }),
  } as unknown as jest.Mocked<Repository<T>>;
}

function makeChannel(overrides: Partial<Channel> = {}): Channel {
  return {
    id: 'ch-1',
    name: 'General',
    description: null,
    type: ChannelType.GROUP,
    status: ChannelStatus.ACTIVE,
    classification: 1,
    createdByPositionId: 'pos-1',
    createdById: 'user-1',
    linkedEntityId: null,
    linkedEntityType: null,
    lastSequence: 0,
    retentionDays: null,
    legalHold: false,
    members: [],
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as Channel;
}

function makeMember(overrides: Partial<ChannelMember> = {}): ChannelMember {
  return {
    id: 'mem-1',
    channelId: 'ch-1',
    positionId: 'pos-1',
    userId: 'user-1',
    role: MemberRole.MEMBER,
    status: MemberStatus.ACTIVE,
    joinSource: 'explicit',
    lastReadSequence: 0,
    removedAt: null,
    removedById: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as ChannelMember;
}

function makeMessage(overrides: Partial<Message> = {}): Message {
  return {
    id: 'msg-1',
    channelId: 'ch-1',
    idempotencyKey: null,
    sequence: 1,
    type: MessageType.TEXT,
    senderId: 'user-1',
    senderPositionId: 'pos-1',
    body: 'Hello world',
    attachments: [],
    systemPayload: null,
    parentMessageId: null,
    replyCount: 0,
    classification: 1,
    isEdited: false,
    editedAt: null,
    isDeleted: false,
    deletedAt: null,
    deletedById: null,
    edits: [],
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as Message;
}

// DataSource mock that runs transaction callback synchronously with a mock em
function makeMockDataSource(overrides: {
  dmRows?: Array<{ channel_id: string }>;
  nextSeq?: number;
} = {}) {
  const emQuery = jest.fn()
    .mockResolvedValueOnce(undefined)                            // SELECT ... FOR UPDATE
    .mockResolvedValueOnce([{ next_seq: overrides.nextSeq ?? 1 }]); // UPDATE ... RETURNING

  const emRepo = {
    create: jest.fn((dto: any) => ({ id: 'msg-new', ...dto })),
    save: jest.fn().mockImplementation(async (entity: any) => entity),
  };

  const mockEm = {
    query: emQuery,
    getRepository: jest.fn().mockReturnValue(emRepo),
  };

  return {
    query: jest.fn().mockResolvedValue(overrides.dmRows ?? []),
    transaction: jest.fn().mockImplementation(async (cb: (em: any) => Promise<any>) => cb(mockEm)),
    _emQuery: emQuery,
    _emRepo: emRepo,
  };
}

// ── Test suite ─────────────────────────────────────────────────────────────────

describe('ChatService', () => {
  let service: ChatService;
  let channelRepo: jest.Mocked<Repository<Channel>>;
  let memberRepo: jest.Mocked<Repository<ChannelMember>>;
  let messageRepo: jest.Mocked<Repository<Message>>;
  let editRepo: jest.Mocked<Repository<MessageEdit>>;
  let dataSource: ReturnType<typeof makeMockDataSource>;
  let auditService: { emit: jest.Mock };
  let eventEmitter: { emit: jest.Mock };

  function rebuildService() {
    service = new ChatService(
      channelRepo as any,
      memberRepo as any,
      messageRepo as any,
      editRepo as any,
      dataSource as unknown as DataSource,
      auditService as unknown as AuditService,
      eventEmitter as unknown as EventEmitter2,
    );
  }

  beforeEach(() => {
    channelRepo  = mockRepo<Channel>();
    memberRepo   = mockRepo<ChannelMember>();
    messageRepo  = mockRepo<Message>();
    editRepo     = mockRepo<MessageEdit>();
    dataSource   = makeMockDataSource();
    auditService = { emit: jest.fn().mockResolvedValue(undefined) };
    eventEmitter = { emit: jest.fn() };
    rebuildService();
  });

  // ── createChannel ─────────────────────────────────────────────────────────────

  describe('createChannel', () => {
    it('throws BadRequestException when trying to create a DIRECT channel', async () => {
      await expect(
        service.createChannel({ type: ChannelType.DIRECT }, 'user-1', 'pos-1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException when trying to create a DEPARTMENT channel', async () => {
      await expect(
        service.createChannel({ type: ChannelType.DEPARTMENT, name: 'Ops' }, 'user-1', 'pos-1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException when trying to create a SYSTEM_NOTIFICATION channel', async () => {
      await expect(
        service.createChannel({ type: ChannelType.SYSTEM_NOTIFICATION }, 'user-1', 'pos-1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('creates a GROUP channel and adds creator as OWNER', async () => {
      memberRepo.findOne.mockResolvedValue(null);  // no existing membership

      const channel = await service.createChannel(
        { type: ChannelType.GROUP, name: 'Ops team', classification: 1 },
        'user-1',
        'pos-1',
      );

      expect(channelRepo.save).toHaveBeenCalledTimes(1);
      const created = channelRepo.create.mock.calls[0][0] as Partial<Channel>;
      expect(created.type).toBe(ChannelType.GROUP);

      // Creator added as OWNER
      const ownerMember = memberRepo.create.mock.calls.find(
        (c) => (c[0] as Partial<ChannelMember>).role === MemberRole.OWNER,
      );
      expect(ownerMember).toBeDefined();
    });

    it('emits chat.channel_created event', async () => {
      memberRepo.findOne.mockResolvedValue(null);

      await service.createChannel(
        { type: ChannelType.GROUP, name: 'Flood ops' },
        'user-1',
        'pos-1',
      );

      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'chat.channel_created',
        expect.objectContaining({ type: ChannelType.GROUP }),
      );
    });

    it('adds initial members when memberPositionIds provided', async () => {
      memberRepo.findOne.mockResolvedValue(null);

      await service.createChannel(
        { type: ChannelType.GROUP, name: 'Team', memberPositionIds: ['pos-1', 'pos-2', 'pos-3'] },
        'user-1',
        'pos-1',
      );

      // pos-1 is creator (OWNER), pos-2 and pos-3 are additional MEMBER additions
      const allCreatedMembers = memberRepo.create.mock.calls.map(
        (c) => (c[0] as Partial<ChannelMember>).positionId,
      );
      expect(allCreatedMembers).toContain('pos-2');
      expect(allCreatedMembers).toContain('pos-3');
    });
  });

  // ── getOrCreateDmChannel ──────────────────────────────────────────────────────

  describe('getOrCreateDmChannel', () => {
    it('returns existing DM channel when one already exists', async () => {
      dataSource = makeMockDataSource({ dmRows: [{ channel_id: 'ch-existing' }] });
      rebuildService();

      const existingChannel = makeChannel({ id: 'ch-existing', type: ChannelType.DIRECT });
      channelRepo.findOne.mockResolvedValue(existingChannel);

      const result = await service.getOrCreateDmChannel('pos-1', 'user-1', 'pos-2');

      expect(result.id).toBe('ch-existing');
      expect(channelRepo.save).not.toHaveBeenCalled();
    });

    it('creates a new DM channel when none exists', async () => {
      dataSource = makeMockDataSource({ dmRows: [] });
      rebuildService();

      memberRepo.findOne.mockResolvedValue(null);

      const result = await service.getOrCreateDmChannel('pos-1', 'user-1', 'pos-2');

      expect(channelRepo.save).toHaveBeenCalledTimes(1);
      const created = channelRepo.create.mock.calls[0][0] as Partial<Channel>;
      expect(created.type).toBe(ChannelType.DIRECT);
    });
  });

  // ── createLinkedChannel ───────────────────────────────────────────────────────

  describe('createLinkedChannel', () => {
    it('is idempotent — returns existing channel without creating a duplicate', async () => {
      const existingChannel = makeChannel({ linkedEntityId: 'task-1', linkedEntityType: 'task' });
      channelRepo.findOne.mockResolvedValue(existingChannel);

      const result = await service.createLinkedChannel({
        type: ChannelType.TASK_LINKED,
        name: 'Task discussion',
        classification: 1,
        linkedEntityId: 'task-1',
        linkedEntityType: 'task',
        memberPositionIds: ['pos-1'],
      });

      expect(result).toBe(existingChannel);
      expect(channelRepo.save).not.toHaveBeenCalled();
    });

    it('creates and persists new linked channel when none exists', async () => {
      channelRepo.findOne.mockResolvedValue(null);
      memberRepo.findOne.mockResolvedValue(null);

      const result = await service.createLinkedChannel({
        type: ChannelType.TASK_LINKED,
        name: 'Task discussion',
        classification: 2,
        linkedEntityId: 'task-99',
        linkedEntityType: 'task',
        memberPositionIds: ['pos-1', 'pos-2'],
      });

      expect(channelRepo.save).toHaveBeenCalledTimes(1);
      const created = channelRepo.create.mock.calls[0][0] as Partial<Channel>;
      expect(created.linkedEntityId).toBe('task-99');
      expect(created.classification).toBe(2);
    });
  });

  // ── sendMessage ───────────────────────────────────────────────────────────────

  describe('sendMessage', () => {
    it('throws NotFoundException when channel does not exist', async () => {
      channelRepo.findOne.mockResolvedValue(null);

      await expect(
        service.sendMessage('ch-missing', { body: 'Hi' }, 'user-1', 'pos-1', 3),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws ForbiddenException when actor clearance is below channel classification', async () => {
      channelRepo.findOne.mockResolvedValue(makeChannel({ classification: 3 }));

      await expect(
        service.sendMessage('ch-1', { body: 'Hi' }, 'user-1', 'pos-1', 2),
      ).rejects.toThrow(ForbiddenException);
    });

    it('throws BadRequestException when channel is READ_ONLY', async () => {
      channelRepo.findOne.mockResolvedValue(makeChannel({ status: ChannelStatus.READ_ONLY }));

      await expect(
        service.sendMessage('ch-1', { body: 'Hi' }, 'user-1', 'pos-1', 3),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException when channel is ARCHIVED', async () => {
      channelRepo.findOne.mockResolvedValue(makeChannel({ status: ChannelStatus.ARCHIVED }));

      await expect(
        service.sendMessage('ch-1', { body: 'Hi' }, 'user-1', 'pos-1', 3),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws ForbiddenException on EMERGENCY_BROADCAST when sender is not OWNER', async () => {
      channelRepo.findOne.mockResolvedValue(
        makeChannel({ type: ChannelType.EMERGENCY_BROADCAST }),
      );
      memberRepo.findOne.mockResolvedValue(makeMember({ role: MemberRole.MEMBER }));

      await expect(
        service.sendMessage('ch-1', { body: 'Alert!' }, 'user-1', 'pos-1', 3),
      ).rejects.toThrow(ForbiddenException);
    });

    it('allows EMERGENCY_BROADCAST when sender is OWNER', async () => {
      channelRepo.findOne.mockResolvedValue(
        makeChannel({ type: ChannelType.EMERGENCY_BROADCAST }),
      );
      memberRepo.findOne.mockResolvedValue(makeMember({ role: MemberRole.OWNER }));

      const result = await service.sendMessage('ch-1', { body: 'Alert!' }, 'user-1', 'pos-1', 3);

      expect(result).toBeDefined();
      expect(result.body).toBe('Alert!');
    });

    it('throws BadRequestException when message has no body and no attachments', async () => {
      channelRepo.findOne.mockResolvedValue(makeChannel());

      await expect(
        service.sendMessage('ch-1', {}, 'user-1', 'pos-1', 3),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException when body exceeds 8000 characters', async () => {
      channelRepo.findOne.mockResolvedValue(makeChannel());

      await expect(
        service.sendMessage('ch-1', { body: 'a'.repeat(8001) }, 'user-1', 'pos-1', 3),
      ).rejects.toThrow(BadRequestException);
    });

    it('returns duplicate when idempotencyKey already exists', async () => {
      const existing = makeMessage({ idempotencyKey: 'idem-key-1' });
      channelRepo.findOne.mockResolvedValue(makeChannel());
      messageRepo.findOne.mockResolvedValue(existing);

      const result = await service.sendMessage(
        'ch-1',
        { body: 'Hi', idempotencyKey: 'idem-key-1' },
        'user-1',
        'pos-1',
        3,
      );

      expect(result).toBe(existing);
      expect(dataSource.transaction).not.toHaveBeenCalled();
    });

    it('persists message and emits chat.message_created on success', async () => {
      channelRepo.findOne.mockResolvedValue(makeChannel());
      messageRepo.findOne.mockResolvedValue(null);

      const result = await service.sendMessage(
        'ch-1',
        { body: 'Hello team' },
        'user-1',
        'pos-1',
        3,
      );

      expect(dataSource.transaction).toHaveBeenCalledTimes(1);
      expect(result.body).toBe('Hello team');
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'chat.message_created',
        expect.objectContaining({ channelId: 'ch-1', senderId: 'user-1' }),
      );
    });

    it('increments replyCount on parent message when parentMessageId is set', async () => {
      channelRepo.findOne.mockResolvedValue(makeChannel());
      messageRepo.findOne.mockResolvedValue(null);

      // The em.getRepository(Message).save returns the message with parentMessageId set
      const mockEmRepo = {
        create: jest.fn((dto: any) => ({ id: 'msg-reply', ...dto })),
        save: jest.fn().mockImplementation(async (entity: any) => ({
          ...entity,
          id: 'msg-reply',
        })),
      };
      (dataSource.transaction as jest.Mock).mockImplementationOnce(async (cb: any) =>
        cb({
          query: jest.fn()
            .mockResolvedValueOnce(undefined)
            .mockResolvedValueOnce([{ next_seq: 2 }]),
          getRepository: jest.fn().mockReturnValue(mockEmRepo),
        }),
      );

      await service.sendMessage(
        'ch-1',
        { body: 'Reply', parentMessageId: 'msg-1' },
        'user-1',
        'pos-1',
        3,
      );

      expect(messageRepo.increment).toHaveBeenCalledWith(
        { id: 'msg-1' },
        'replyCount',
        1,
      );
    });
  });

  // ── markRead ──────────────────────────────────────────────────────────────────

  describe('markRead', () => {
    it('does nothing when actor is not a member of the channel', async () => {
      memberRepo.findOne.mockResolvedValue(null);

      await service.markRead('ch-1', 5, 'pos-1');

      expect(memberRepo.save).not.toHaveBeenCalled();
      expect(eventEmitter.emit).not.toHaveBeenCalled();
    });

    it('updates lastReadSequence and emits when sequence advances', async () => {
      memberRepo.findOne.mockResolvedValue(makeMember({ lastReadSequence: 3 }));

      await service.markRead('ch-1', 7, 'pos-1');

      const saved = (memberRepo.save as jest.Mock).mock.calls[0][0] as ChannelMember;
      expect(saved.lastReadSequence).toBe(7);
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'chat.messages_read',
        expect.objectContaining({ upToSequence: 7 }),
      );
    });

    it('does not update when sequence is not higher than lastReadSequence', async () => {
      memberRepo.findOne.mockResolvedValue(makeMember({ lastReadSequence: 10 }));

      await service.markRead('ch-1', 5, 'pos-1');

      expect(memberRepo.save).not.toHaveBeenCalled();
    });
  });

  // ── editMessage ───────────────────────────────────────────────────────────────

  describe('editMessage', () => {
    it('throws NotFoundException when message not found', async () => {
      messageRepo.findOne.mockResolvedValue(null);

      await expect(service.editMessage('msg-x', 'new body', 'user-1', 3)).rejects.toThrow(NotFoundException);
    });

    it('throws ForbiddenException when editor is not the sender', async () => {
      messageRepo.findOne.mockResolvedValue(makeMessage({ senderId: 'user-2' }));
      channelRepo.findOne.mockResolvedValue(makeChannel());

      await expect(service.editMessage('msg-1', 'new body', 'user-1', 3)).rejects.toThrow(ForbiddenException);
    });

    it('throws BadRequestException when message is under legal hold', async () => {
      messageRepo.findOne.mockResolvedValue(makeMessage({ senderId: 'user-1' }));
      channelRepo.findOne.mockResolvedValue(makeChannel({ legalHold: true }));

      await expect(service.editMessage('msg-1', 'new body', 'user-1', 3)).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException when edit window has expired (>60 min)', async () => {
      messageRepo.findOne.mockResolvedValue(
        makeMessage({
          senderId: 'user-1',
          createdAt: new Date(Date.now() - 61 * 60_000),
        }),
      );
      channelRepo.findOne.mockResolvedValue(makeChannel());

      await expect(service.editMessage('msg-1', 'new body', 'user-1', 3)).rejects.toThrow(BadRequestException);
    });

    it('saves edit history and updates body within window', async () => {
      messageRepo.findOne.mockResolvedValue(
        makeMessage({ senderId: 'user-1', createdAt: new Date() }),
      );
      channelRepo.findOne.mockResolvedValue(makeChannel());

      const result = await service.editMessage('msg-1', 'updated content', 'user-1', 3);

      expect(editRepo.save).toHaveBeenCalledTimes(1);
      expect(result.body).toBe('updated content');
      expect(result.isEdited).toBe(true);
    });
  });

  // ── deleteMessage ─────────────────────────────────────────────────────────────

  describe('deleteMessage', () => {
    it('throws ForbiddenException when deleter is not the sender', async () => {
      messageRepo.findOne.mockResolvedValue(makeMessage({ senderId: 'user-2' }));
      channelRepo.findOne.mockResolvedValue(makeChannel());

      await expect(service.deleteMessage('msg-1', 'user-1', 3)).rejects.toThrow(ForbiddenException);
    });

    it('throws BadRequestException when channel is under legal hold', async () => {
      messageRepo.findOne.mockResolvedValue(makeMessage({ senderId: 'user-1' }));
      channelRepo.findOne.mockResolvedValue(makeChannel({ legalHold: true }));

      await expect(service.deleteMessage('msg-1', 'user-1', 3)).rejects.toThrow(BadRequestException);
    });

    it('is idempotent — does not throw when message already deleted', async () => {
      messageRepo.findOne.mockResolvedValue(makeMessage({ senderId: 'user-1', isDeleted: true }));

      await expect(service.deleteMessage('msg-1', 'user-1', 3)).resolves.not.toThrow();
      expect(messageRepo.save).not.toHaveBeenCalled();
    });

    it('soft-deletes message (nulls body, sets isDeleted)', async () => {
      messageRepo.findOne.mockResolvedValue(makeMessage({ senderId: 'user-1', body: 'Secret' }));
      channelRepo.findOne.mockResolvedValue(makeChannel());

      await service.deleteMessage('msg-1', 'user-1', 3);

      const saved = (messageRepo.save as jest.Mock).mock.calls[0][0] as Message;
      expect(saved.isDeleted).toBe(true);
      expect(saved.body).toBeNull();
      expect(saved.attachments).toEqual([]);
    });
  });

  // ── enforceRetentionPolicies ──────────────────────────────────────────────────

  describe('enforceRetentionPolicies', () => {
    it('returns 0 when no channels have retention policies', async () => {
      const qb = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([]),
      };
      channelRepo.createQueryBuilder.mockReturnValue(qb as any);

      const count = await service.enforceRetentionPolicies();

      expect(count).toBe(0);
    });

    it('deletes messages older than retentionDays for channels without legal hold', async () => {
      const retainedChannel = makeChannel({ id: 'ch-retain', retentionDays: 7 });
      const channelQb = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([retainedChannel]),
      };
      channelRepo.createQueryBuilder.mockReturnValue(channelQb as any);

      const msgDeleteQb = {
        delete: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        execute: jest.fn().mockResolvedValue({ affected: 12 }),
      };
      messageRepo.createQueryBuilder.mockReturnValue(msgDeleteQb as any);

      const count = await service.enforceRetentionPolicies();

      expect(count).toBe(12);
      expect(msgDeleteQb.execute).toHaveBeenCalledTimes(1);
    });
  });
});
