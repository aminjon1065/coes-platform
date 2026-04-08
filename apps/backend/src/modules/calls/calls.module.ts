import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { CallSession } from './entities/call-session.entity';
import { CallParticipant } from './entities/call-participant.entity';
import { CallRecording } from './entities/call-recording.entity';
import { CallSchedule } from './entities/call-schedule.entity';
import { CallsService } from './services/calls.service';
import { CallAdminService } from './services/call-admin.service';
import { CallRecordingEventsService } from './services/call-recording-events.service';
import { CallRecordingRetentionService } from './services/call-recording-retention.service';
import { CallsController } from './controllers/calls.controller';
import { CallsAdminController } from './controllers/calls-admin.controller';
import { AuditModule } from '../audit/audit.module';
import { FilesModule } from '../files/files.module';
import { GatewayEventsService } from '../../infra/events/gateway-events.service';
import { MediaCommandsService } from '../../infra/events/media-commands.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([CallSession, CallParticipant, CallRecording, CallSchedule]),
    AuditModule,
    FilesModule,
  ],
  controllers: [CallsController, CallsAdminController],
  providers: [
    CallsService,
    CallAdminService,
    GatewayEventsService,
    MediaCommandsService,
    CallRecordingEventsService,
    CallRecordingRetentionService,
  ],
  exports: [CallsService],
})
export class CallsModule {}
