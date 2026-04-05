import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { CallSession } from './entities/call-session.entity';
import { CallParticipant } from './entities/call-participant.entity';
import { CallRecording } from './entities/call-recording.entity';
import { CallSchedule } from './entities/call-schedule.entity';
import { CallsService } from './services/calls.service';
import { CallsController } from './controllers/calls.controller';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([CallSession, CallParticipant, CallRecording, CallSchedule]),
    AuditModule,
  ],
  controllers: [CallsController],
  providers: [CallsService],
  exports: [CallsService],
})
export class CallsModule {}
