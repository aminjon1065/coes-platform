import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { Channel } from './entities/channel.entity';
import { ChannelMember } from './entities/channel-member.entity';
import { Message } from './entities/message.entity';
import { MessageEdit } from './entities/message-edit.entity';

import { ChatService } from './services/chat.service';
import { PresenceService } from './services/presence.service';
import { ChatController } from './controllers/chat.controller';
import { ChatDomainListener } from './listeners/chat-domain.listener';

import { AuditModule } from '../audit/audit.module';
import { GatewayEventsService } from '../../infra/events/gateway-events.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Channel,
      ChannelMember,
      Message,
      MessageEdit,
    ]),
    AuditModule,
  ],
  controllers: [ChatController],
  providers: [ChatService, PresenceService, ChatDomainListener, GatewayEventsService],
  exports: [ChatService, PresenceService],
})
export class ChatModule {}
