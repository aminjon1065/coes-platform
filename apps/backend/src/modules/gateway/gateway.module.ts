import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { RealtimeGateway } from './realtime.gateway';
import { ConnectionRegistryService } from './services/connection-registry.service';
import { RabbitMqGatewayConsumer } from './services/rabbitmq-gateway.consumer';

import { MessageDelivery } from './entities/message-delivery.entity';

import { ChatModule } from '../chat/chat.module';
import { CallsModule } from '../calls/calls.module';
import { AuditModule } from '../audit/audit.module';

/**
 * WebSocket gateway module (§5 of Chat-AudioVideo-Realtime-Architecture.md).
 *
 * Wires together:
 *  - RealtimeGateway           — @WebSocketGateway on WS_PORT (default 4001)
 *  - ConnectionRegistryService — Redis-backed socket/channel mappings
 *  - RabbitMqGatewayConsumer   — fans RabbitMQ events to local WebSocket clients
 *  - MessageDelivery entity    — per-message delivered/read state for DM channels
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([MessageDelivery]),
    ChatModule,
    CallsModule,
    AuditModule,
  ],
  providers: [
    RealtimeGateway,
    ConnectionRegistryService,
    RabbitMqGatewayConsumer,
  ],
  exports: [RealtimeGateway],
})
export class GatewayModule {}
