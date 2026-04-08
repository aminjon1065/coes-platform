import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository, InjectDataSource } from '@nestjs/typeorm';
import { Repository, DataSource, IsNull } from 'typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';

import { Channel, ChannelType, ChannelStatus } from '../entities/channel.entity';
import { ChannelMember, MemberRole, MemberStatus } from '../entities/channel-member.entity';
import { Message, MessageType } from '../entities/message.entity';
import { MessageEdit } from '../entities/message-edit.entity';

import { AuditService } from '../../audit/services/audit.service';
import { GatewayEventsService } from '../../../infra/events/gateway-events.service';

import { CreateChannelDto } from '../dto/create-channel.dto';
import { SendMessageDto } from '../dto/send-message.dto';
import { ListMessagesDto } from '../dto/list-messages.dto';

/** Max message body length */
const MAX_MESSAGE_LENGTH = 8000;

/** Minutes after send during which a message can be edited */
const EDIT_WINDOW_MINUTES = 60;

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);

  constructor(
    @InjectRepository(Channel)
    private readonly channelRepo: Repository<Channel>,
    @InjectRepository(ChannelMember)
    private readonly memberRepo: Repository<ChannelMember>,
    @InjectRepository(Message)
    private readonly messageRepo: Repository<Message>,
    @InjectRepository(MessageEdit)
    private readonly editRepo: Repository<MessageEdit>,
    @InjectDataSource()
    private readonly dataSource: DataSource,
    private readonly auditService: AuditService,
    private readonly eventEmitter: EventEmitter2,
    private readonly gatewayEvents: GatewayEventsService,
  ) {}

  // ─── Channel Management ──────────────────────────────────────────────────────

  async createChannel(
    dto: CreateChannelDto,
    actorId: string,
    actorPositionId: string,
  ): Promise<Channel> {
    if (dto.type === ChannelType.DIRECT) {
      throw new BadRequestException('Direct message channels are created implicitly via getOrCreateDmChannel()');
    }
    if (dto.type === ChannelType.DEPARTMENT || dto.type === ChannelType.SYSTEM_NOTIFICATION) {
      throw new BadRequestException(`Channel type '${dto.type}' is managed automatically by the platform`);
    }

    const channel = this.channelRepo.create({
      name: dto.name ?? null,
      description: null,
      type: dto.type,
      classification: dto.classification ?? 1,
      createdByPositionId: actorPositionId,
      createdById: actorId,
      retentionDays: dto.retentionDays ?? null,
    });
    await this.channelRepo.save(channel);

    // Add creator as OWNER
    await this.addMember(channel.id, actorPositionId, actorId, MemberRole.OWNER, 'explicit');

    // Add initial members
    if (dto.memberPositionIds?.length) {
      for (const posId of dto.memberPositionIds) {
        if (posId !== actorPositionId) {
          await this.addMember(channel.id, posId, null, MemberRole.MEMBER, 'explicit');
        }
      }
    }

    await this.auditService.emit({
      eventType: 'CHAT_CHANNEL_CREATED',
      resourceType: 'channel',
      resourceId: channel.id,
      actorId,
      details: { type: dto.type, name: dto.name, classification: channel.classification },
    });

    this.eventEmitter.emit('chat.channel_created', {
      channelId: channel.id,
      type: channel.type,
      linkedEntityId: channel.linkedEntityId,
      actorId,
    });

    return channel;
  }

  /**
   * Get or create a DM channel between two positions.
   * DIRECT channels are idempotent — the same two positions always share one channel.
   */
  async getOrCreateDmChannel(
    positionIdA: string,
    userIdA: string,
    positionIdB: string,
  ): Promise<Channel> {
    // Find existing active DM between these two positions
    const existing = await this.dataSource.query<Array<{ channel_id: string }>>(
      `SELECT cm1.channel_id
       FROM   chat.channel_members cm1
       JOIN   chat.channel_members cm2 ON cm1.channel_id = cm2.channel_id
       JOIN   chat.channels c ON c.id = cm1.channel_id
       WHERE  cm1.position_id = $1 AND cm2.position_id = $2
         AND  c.type = 'direct' AND c.status = 'active'
         AND  cm1.status = 'active' AND cm2.status = 'active'
       LIMIT  1`,
      [positionIdA, positionIdB],
    );

    if (existing.length > 0) {
      return this.channelRepo.findOne({ where: { id: existing[0].channel_id } }) as Promise<Channel>;
    }

    // Create new DM channel
    // Classification = lower of the two positions' clearances (safest common level)
    const channel = this.channelRepo.create({
      type: ChannelType.DIRECT,
      classification: 1, // Real impl resolves both users' clearances and picks minimum
      createdById: userIdA,
      createdByPositionId: positionIdA,
    });
    await this.channelRepo.save(channel);

    await this.addMember(channel.id, positionIdA, userIdA, MemberRole.MEMBER, 'explicit');
    await this.addMember(channel.id, positionIdB, null, MemberRole.MEMBER, 'explicit');

    return channel;
  }

  /**
   * Platform-internal: create a linked channel (task/document/department).
   * Called by listeners, not directly by the user-facing API.
   */
  async createLinkedChannel(opts: {
    type: ChannelType;
    name: string;
    classification: number;
    linkedEntityId: string;
    linkedEntityType: string;
    memberPositionIds: string[];
    createdById?: string;
    retentionDays?: number;
  }): Promise<Channel> {
    // Idempotency: check if a channel for this entity already exists
    const existing = await this.channelRepo.findOne({
      where: { linkedEntityId: opts.linkedEntityId, linkedEntityType: opts.linkedEntityType },
    });
    if (existing) return existing;

    const channel = this.channelRepo.create({
      name: opts.name,
      type: opts.type,
      classification: opts.classification,
      linkedEntityId: opts.linkedEntityId,
      linkedEntityType: opts.linkedEntityType,
      createdById: opts.createdById ?? null,
      retentionDays: opts.retentionDays ?? null,
    });
    await this.channelRepo.save(channel);

    for (const posId of opts.memberPositionIds) {
      await this.addMember(channel.id, posId, null, MemberRole.MEMBER, `${opts.linkedEntityType}_derived`);
    }

    this.eventEmitter.emit('chat.channel_created', {
      channelId: channel.id,
      type: opts.type,
      linkedEntityId: opts.linkedEntityId,
      linkedEntityType: opts.linkedEntityType,
    });

    return channel;
  }

  async listChannels(actorPositionId: string, actorClearance: number): Promise<Channel[]> {
    return this.channelRepo
      .createQueryBuilder('c')
      .innerJoin(
        'chat.channel_members', 'cm',
        "cm.channel_id = c.id AND cm.position_id = :pos AND cm.status = 'active'",
        { pos: actorPositionId },
      )
      .where('c.classification <= :clearance', { clearance: actorClearance })
      .andWhere("c.status != 'archived'")
      .orderBy('c.updatedAt', 'DESC')
      .getMany();
  }

  async getChannel(id: string, actorPositionId: string, actorClearance: number): Promise<Channel> {
    const channel = await this.channelRepo.findOne({ where: { id }, relations: ['members'] });
    if (!channel) throw new NotFoundException(`Channel ${id} not found`);
    this.assertChannelAccess(channel, actorPositionId, actorClearance);
    return channel;
  }

  async addMemberToChannel(
    channelId: string,
    positionId: string,
    actorId: string,
    actorPositionId: string,
    actorClearance: number,
  ): Promise<ChannelMember> {
    const channel = await this.channelRepo.findOne({ where: { id: channelId } });
    if (!channel) throw new NotFoundException(`Channel ${channelId} not found`);
    if (channel.type === ChannelType.DIRECT) {
      throw new BadRequestException('Cannot add members to a direct message channel');
    }

    // Must be OWNER or have manage capability
    const actorMembership = await this.memberRepo.findOne({
      where: { channelId, positionId: actorPositionId, status: MemberStatus.ACTIVE },
    });
    if (!actorMembership || actorMembership.role !== MemberRole.OWNER) {
      throw new ForbiddenException('Only channel owners may add members');
    }

    return this.addMember(channelId, positionId, null, MemberRole.MEMBER, 'explicit');
  }

  async removeMemberFromChannel(
    channelId: string,
    memberPositionId: string,
    actorId: string,
    actorPositionId: string,
  ): Promise<void> {
    const member = await this.memberRepo.findOne({
      where: { channelId, positionId: memberPositionId, status: MemberStatus.ACTIVE },
    });
    if (!member) throw new NotFoundException('Member not found in channel');

    const isSelf = memberPositionId === actorPositionId;
    const actorMembership = await this.memberRepo.findOne({
      where: { channelId, positionId: actorPositionId, status: MemberStatus.ACTIVE },
    });
    const isOwner = actorMembership?.role === MemberRole.OWNER;

    if (!isSelf && !isOwner) throw new ForbiddenException('Only channel owners may remove other members');

    member.status = isSelf ? MemberStatus.LEFT : MemberStatus.REMOVED;
    member.removedAt = new Date();
    member.removedById = actorId;
    await this.memberRepo.save(member);
  }

  /** Mark linked channel as read-only (called when task is closed or document archived) */
  async setChannelReadOnly(linkedEntityId: string, linkedEntityType: string): Promise<void> {
    await this.channelRepo.update(
      { linkedEntityId, linkedEntityType },
      { status: ChannelStatus.READ_ONLY },
    );
  }

  // ─── Messaging ───────────────────────────────────────────────────────────────

  async sendMessage(
    channelId: string,
    dto: SendMessageDto,
    actorId: string,
    actorPositionId: string,
    actorClearance: number,
  ): Promise<Message> {
    const channel = await this.channelRepo.findOne({ where: { id: channelId } });
    if (!channel) throw new NotFoundException(`Channel ${channelId} not found`);
    this.assertChannelAccess(channel, actorPositionId, actorClearance);

    if (channel.status === ChannelStatus.READ_ONLY) {
      throw new BadRequestException('This channel is read-only');
    }
    if (channel.status === ChannelStatus.ARCHIVED) {
      throw new BadRequestException('This channel is archived');
    }

    // Emergency broadcast: only designated senders
    if (channel.type === ChannelType.EMERGENCY_BROADCAST) {
      const membership = await this.memberRepo.findOne({
        where: { channelId, positionId: actorPositionId, status: MemberStatus.ACTIVE },
      });
      if (!membership || membership.role !== MemberRole.OWNER) {
        throw new ForbiddenException('Only designated officials may broadcast on emergency channels');
      }
    }

    if (!dto.body && (!dto.attachments || dto.attachments.length === 0)) {
      throw new BadRequestException('Message must have body or attachments');
    }
    if (dto.body && dto.body.length > MAX_MESSAGE_LENGTH) {
      throw new BadRequestException(`Message body exceeds maximum length of ${MAX_MESSAGE_LENGTH}`);
    }

    // Idempotency check
    if (dto.idempotencyKey) {
      const duplicate = await this.messageRepo.findOne({
        where: { channelId, idempotencyKey: dto.idempotencyKey },
      });
      if (duplicate) return duplicate;
    }

    // Atomic sequence number assignment + message persist
    const message = await this.dataSource.transaction(async (em) => {
      // Lock the channel row to serialize sequence assignment
      await em.query(
        `SELECT id FROM chat.channels WHERE id = $1 FOR UPDATE`,
        [channelId],
      );

      const [{ next_seq }] = await em.query<Array<{ next_seq: number }>>(
        `UPDATE chat.channels SET last_sequence = last_sequence + 1 WHERE id = $1 RETURNING last_sequence AS next_seq`,
        [channelId],
      );

      const msgClassification = dto.classification ?? channel.classification;
      if (actorClearance < msgClassification) {
        throw new ForbiddenException('Your clearance is insufficient for the specified message classification');
      }

      const msg = em.getRepository(Message).create({
        channelId,
        sequence: next_seq,
        type: dto.type ?? MessageType.TEXT,
        senderId: actorId,
        senderPositionId: actorPositionId,
        body: dto.body ?? null,
        attachments: dto.attachments?.map(a => ({
          fileId: a.fileId,
          fileName: a.fileName,
          mimeType: a.mimeType,
          fileSizeBytes: a.fileSizeBytes,
          classification: a.classification ?? channel.classification,
        })) ?? [],
        parentMessageId: dto.parentMessageId ?? null,
        classification: msgClassification,
        idempotencyKey: dto.idempotencyKey ?? null,
      });
      return em.getRepository(Message).save(msg);
    });

    // Increment reply count on parent
    if (message.parentMessageId) {
      await this.messageRepo.increment({ id: message.parentMessageId }, 'replyCount', 1);
    }

    await this.auditService.emit({
      eventType: 'CHAT_MESSAGE_SENT',
      resourceType: 'message',
      resourceId: message.id,
      actorId,
      details: { channelId, sequence: message.sequence, type: message.type },
    });

    // Phase 2 fan-out: publish for Real-time Gateway delivery
    this.eventEmitter.emit('chat.message_created', {
      messageId: message.id,
      channelId,
      sequence: message.sequence,
      senderId: actorId,
      senderPositionId: actorPositionId,
      type: message.type,
      body: message.isDeleted ? null : message.body,
      attachments: message.attachments,
      parentMessageId: message.parentMessageId,
      classification: message.classification,
      createdAt: message.createdAt,
    });

    await this.gatewayEvents.publishToRoom(`chat.channel.${channelId}`, {
      event: 'chat.message.created',
      data: {
        id: message.id,
        channelId,
        sequence: message.sequence,
        senderId: actorId,
        senderPositionId: actorPositionId,
        type: message.type,
        body: message.body,
        attachments: message.attachments,
        parentMessageId: message.parentMessageId,
        classification: message.classification,
        isEdited: message.isEdited,
        isDeleted: message.isDeleted,
        createdAt: message.createdAt,
        updatedAt: message.updatedAt,
      },
    });

    return message;
  }

  async listMessages(
    channelId: string,
    dto: ListMessagesDto,
    actorPositionId: string,
    actorClearance: number,
  ): Promise<Message[]> {
    const channel = await this.channelRepo.findOne({ where: { id: channelId } });
    if (!channel) throw new NotFoundException(`Channel ${channelId} not found`);
    this.assertChannelAccess(channel, actorPositionId, actorClearance);

    const qb = this.messageRepo
      .createQueryBuilder('m')
      .where('m.channelId = :channelId', { channelId })
      .andWhere('m.classification <= :clearance', { clearance: actorClearance });

    if (dto.after !== undefined) qb.andWhere('m.sequence > :after', { after: dto.after });
    if (dto.before !== undefined) qb.andWhere('m.sequence < :before', { before: dto.before });
    if (dto.parentMessageId) {
      qb.andWhere('m.parentMessageId = :pid', { pid: dto.parentMessageId });
    } else if (!dto.parentMessageId) {
      // Default: top-level messages only
      qb.andWhere('m.parentMessageId IS NULL');
    }

    return qb
      .orderBy('m.sequence', 'ASC')
      .limit(dto.limit ?? 50)
      .getMany();
  }

  async editMessage(
    messageId: string,
    newBody: string,
    actorId: string,
    actorClearance: number,
  ): Promise<Message> {
    const message = await this.messageRepo.findOne({ where: { id: messageId } });
    if (!message) throw new NotFoundException(`Message ${messageId} not found`);
    if (message.isDeleted) throw new BadRequestException('Cannot edit a deleted message');
    if (message.senderId !== actorId) throw new ForbiddenException('Only the sender may edit their message');

    const channel = await this.channelRepo.findOne({ where: { id: message.channelId } });
    if (channel?.legalHold) throw new BadRequestException('Message cannot be edited under legal hold');

    const minutesSinceSend = (Date.now() - message.createdAt.getTime()) / 60_000;
    if (minutesSinceSend > EDIT_WINDOW_MINUTES) {
      throw new BadRequestException(`Messages can only be edited within ${EDIT_WINDOW_MINUTES} minutes of sending`);
    }

    // Preserve original content
    const edit = this.editRepo.create({
      messageId,
      previousBody: message.body,
      previousAttachments: message.attachments,
      editedById: actorId,
    });
    await this.editRepo.save(edit);

    message.body = newBody;
    message.isEdited = true;
    message.editedAt = new Date();
    await this.messageRepo.save(message);

    this.eventEmitter.emit('chat.message_edited', { messageId, channelId: message.channelId, actorId });

    await this.gatewayEvents.publishToRoom(`chat.channel.${message.channelId}`, {
      event: 'chat.message.edited',
      data: {
        id: message.id,
        channelId: message.channelId,
        sequence: message.sequence,
        body: message.body,
        isEdited: message.isEdited,
        editedAt: message.editedAt,
        updatedAt: message.updatedAt,
      },
    });

    return message;
  }

  async deleteMessage(
    messageId: string,
    actorId: string,
    actorClearance: number,
  ): Promise<void> {
    const message = await this.messageRepo.findOne({ where: { id: messageId } });
    if (!message) throw new NotFoundException(`Message ${messageId} not found`);
    if (message.isDeleted) return; // idempotent
    if (message.senderId !== actorId) throw new ForbiddenException('Only the sender may delete their message');

    const channel = await this.channelRepo.findOne({ where: { id: message.channelId } });
    if (channel?.legalHold) throw new BadRequestException('Message cannot be deleted under legal hold');

    // Soft delete: null out content, keep record for audit
    message.isDeleted = true;
    message.deletedAt = new Date();
    message.deletedById = actorId;
    message.body = null;
    message.attachments = [];
    await this.messageRepo.save(message);

    await this.auditService.emit({
      eventType: 'CHAT_MESSAGE_DELETED',
      resourceType: 'message',
      resourceId: messageId,
      actorId,
      details: { channelId: message.channelId, sequence: message.sequence },
    });

    this.eventEmitter.emit('chat.message_deleted', { messageId, channelId: message.channelId, actorId });

    await this.gatewayEvents.publishToRoom(`chat.channel.${message.channelId}`, {
      event: 'chat.message.deleted',
      data: {
        id: message.id,
        channelId: message.channelId,
        sequence: message.sequence,
        isDeleted: true,
        deletedAt: message.deletedAt,
        updatedAt: message.updatedAt,
      },
    });
  }

  // ─── Read receipts ───────────────────────────────────────────────────────────

  /**
   * Mark all messages up to (and including) the given sequence as read.
   * Uses last-read-sequence model (one record per member per channel).
   */
  async markRead(
    channelId: string,
    upToSequence: number,
    actorPositionId: string,
  ): Promise<void> {
    const member = await this.memberRepo.findOne({
      where: { channelId, positionId: actorPositionId, status: MemberStatus.ACTIVE },
    });
    if (!member) return;

    if (upToSequence > member.lastReadSequence) {
      member.lastReadSequence = upToSequence;
      await this.memberRepo.save(member);

      this.eventEmitter.emit('chat.messages_read', {
        channelId,
        positionId: actorPositionId,
        upToSequence,
      });

      await this.gatewayEvents.publishToRoom(`chat.channel.${channelId}`, {
        event: 'chat.messages.read',
        data: {
          channelId,
          positionId: actorPositionId,
          upToSequence,
        },
      });
    }
  }

  async getUnreadCount(channelId: string, actorPositionId: string): Promise<number> {
    const member = await this.memberRepo.findOne({
      where: { channelId, positionId: actorPositionId, status: MemberStatus.ACTIVE },
    });
    if (!member) return 0;

    const channel = await this.channelRepo.findOne({ where: { id: channelId } });
    if (!channel) return 0;

    return Math.max(0, channel.lastSequence - member.lastReadSequence);
  }

  // ─── Retention policy enforcement ────────────────────────────────────────────

  /**
   * Delete messages older than the channel's retention policy.
   * Called by a scheduled job.
   */
  async enforceRetentionPolicies(): Promise<number> {
    const channels = await this.channelRepo
      .createQueryBuilder('c')
      .where('c.retention_days IS NOT NULL')
      .andWhere('c.legal_hold = false')
      .getMany();

    let deletedCount = 0;
    for (const channel of channels) {
      const cutoff = new Date(Date.now() - channel.retentionDays! * 86_400_000);
      const result = await this.messageRepo
        .createQueryBuilder()
        .delete()
        .where('channel_id = :id AND created_at < :cutoff AND is_deleted = false', {
          id: channel.id,
          cutoff,
        })
        .execute();
      deletedCount += result.affected ?? 0;
    }

    if (deletedCount > 0) {
      this.logger.log(`Retention policy: deleted ${deletedCount} messages`);
    }
    return deletedCount;
  }

  // ─── Private helpers ─────────────────────────────────────────────────────────

  private async addMember(
    channelId: string,
    positionId: string,
    userId: string | null,
    role: MemberRole,
    joinSource: string,
  ): Promise<ChannelMember> {
    // Upsert — re-activate if previously removed
    const existing = await this.memberRepo.findOne({ where: { channelId, positionId } });
    if (existing) {
      if (existing.status === MemberStatus.ACTIVE) return existing;
      existing.status = MemberStatus.ACTIVE;
      existing.removedAt = null;
      existing.removedById = null;
      if (userId) existing.userId = userId;
      return this.memberRepo.save(existing);
    }

    const member = this.memberRepo.create({
      channelId,
      positionId,
      userId,
      role,
      joinSource,
    });
    return this.memberRepo.save(member);
  }

  private assertChannelAccess(channel: Channel, positionId: string, clearance: number): void {
    if (clearance < channel.classification) {
      throw new ForbiddenException(`Clearance level ${clearance} insufficient for channel classification ${channel.classification}`);
    }
  }
}
