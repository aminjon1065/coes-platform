import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  ParseUUIDPipe,
  HttpCode,
  HttpStatus,
  Req,
} from '@nestjs/common';
import { FastifyRequest } from 'fastify';
import { ChatService } from '../services/chat.service';
import { PresenceService, PresenceStatus } from '../services/presence.service';
import { CreateChannelDto } from '../dto/create-channel.dto';
import { SendMessageDto } from '../dto/send-message.dto';
import { ListMessagesDto } from '../dto/list-messages.dto';

interface AuthenticatedRequest extends FastifyRequest {
  user: {
    sub: string;
    clearance: number;
    positionId?: string;
  };
}

@Controller('chat')
export class ChatController {
  constructor(
    private readonly chatService: ChatService,
    private readonly presenceService: PresenceService,
  ) {}

  // ─── Channels ─────────────────────────────────────────────────────────────────

  @Get('channels')
  listChannels(@Req() req: AuthenticatedRequest) {
    return this.chatService.listChannels(req.user.positionId!, req.user.clearance ?? 0);
  }

  @Post('channels')
  @HttpCode(HttpStatus.CREATED)
  createChannel(@Body() dto: CreateChannelDto, @Req() req: AuthenticatedRequest) {
    return this.chatService.createChannel(dto, req.user.sub, req.user.positionId!);
  }

  @Get('channels/:id')
  getChannel(@Param('id', ParseUUIDPipe) id: string, @Req() req: AuthenticatedRequest) {
    return this.chatService.getChannel(id, req.user.positionId!, req.user.clearance ?? 0);
  }

  /** Get or create a DM channel with another position */
  @Post('channels/dm/:targetPositionId')
  @HttpCode(HttpStatus.OK)
  getOrCreateDm(
    @Param('targetPositionId', ParseUUIDPipe) targetPositionId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.chatService.getOrCreateDmChannel(
      req.user.positionId!,
      req.user.sub,
      targetPositionId,
    );
  }

  // ─── Members ──────────────────────────────────────────────────────────────────

  @Post('channels/:id/members')
  @HttpCode(HttpStatus.CREATED)
  addMember(
    @Param('id', ParseUUIDPipe) id: string,
    @Body('positionId') positionId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.chatService.addMemberToChannel(
      id,
      positionId,
      req.user.sub,
      req.user.positionId!,
      req.user.clearance ?? 0,
    );
  }

  @Delete('channels/:id/members/:positionId')
  @HttpCode(HttpStatus.NO_CONTENT)
  removeMember(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('positionId', ParseUUIDPipe) positionId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.chatService.removeMemberFromChannel(
      id,
      positionId,
      req.user.sub,
      req.user.positionId!,
    );
  }

  // ─── Messages ─────────────────────────────────────────────────────────────────

  @Get('channels/:id/messages')
  listMessages(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: ListMessagesDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.chatService.listMessages(id, query, req.user.positionId!, req.user.clearance ?? 0);
  }

  @Post('channels/:id/messages')
  @HttpCode(HttpStatus.CREATED)
  sendMessage(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SendMessageDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.chatService.sendMessage(
      id,
      dto,
      req.user.sub,
      req.user.positionId!,
      req.user.clearance ?? 0,
    );
  }

  @Patch('messages/:messageId')
  editMessage(
    @Param('messageId', ParseUUIDPipe) messageId: string,
    @Body('body') body: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.chatService.editMessage(messageId, body, req.user.sub, req.user.clearance ?? 0);
  }

  @Delete('messages/:messageId')
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteMessage(
    @Param('messageId', ParseUUIDPipe) messageId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.chatService.deleteMessage(messageId, req.user.sub, req.user.clearance ?? 0);
  }

  // ─── Read receipts ────────────────────────────────────────────────────────────

  /** 2.5.3 — Mark messages as read up to a sequence number */
  @Post('channels/:id/read')
  @HttpCode(HttpStatus.NO_CONTENT)
  markRead(
    @Param('id', ParseUUIDPipe) id: string,
    @Body('sequence') sequence: number,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.chatService.markRead(id, sequence, req.user.positionId!);
  }

  @Get('channels/:id/unread')
  getUnread(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.chatService.getUnreadCount(id, req.user.positionId!);
  }

  // ─── Presence ─────────────────────────────────────────────────────────────────

  /** 2.5.1 — Get presence state for a user */
  @Get('presence/:userId')
  getPresence(@Param('userId', ParseUUIDPipe) userId: string) {
    return this.presenceService.getPresence(userId);
  }

  /** Update own presence status */
  @Post('presence')
  @HttpCode(HttpStatus.NO_CONTENT)
  setPresence(
    @Body('status') status: PresenceStatus,
    @Body('device') device: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.presenceService.setPresence(req.user.sub, status, device);
  }

  /** WebSocket gateway calls this on client ping to refresh presence TTL */
  @Post('presence/heartbeat')
  @HttpCode(HttpStatus.NO_CONTENT)
  heartbeat(@Req() req: AuthenticatedRequest) {
    return this.presenceService.heartbeat(req.user.sub);
  }

  /** Typing indicator */
  @Post('channels/:id/typing')
  @HttpCode(HttpStatus.NO_CONTENT)
  setTyping(
    @Param('id', ParseUUIDPipe) id: string,
    @Body('isTyping') isTyping: boolean,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.presenceService.setTyping(id, req.user.sub, isTyping);
  }
}
