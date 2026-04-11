import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { Task } from './entities/task.entity';
import { TaskType } from './entities/task-type.entity';
import { TaskAssignment } from './entities/task-assignment.entity';
import { TaskHistory } from './entities/task-history.entity';
import { TaskComment } from './entities/task-comment.entity';
import { TaskAttachment } from './entities/task-attachment.entity';
import { TaskDeadlineExtensionRequest } from './entities/task-deadline-extension-request.entity';

import { TasksService } from './services/tasks.service';
import { TasksSchedulerService } from './services/tasks-scheduler.service';
import { TasksController } from './controllers/tasks.controller';
import { TasksEdmsListener } from './listeners/tasks-edms.listener';
import { TasksEscalationListener } from './listeners/tasks-escalation.listener';

import { AuditModule } from '../audit/audit.module';
import { OrgModule } from '../org/org.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Task,
      TaskType,
      TaskAssignment,
      TaskHistory,
      TaskComment,
      TaskAttachment,
      TaskDeadlineExtensionRequest,
    ]),
    AuditModule,
    OrgModule,
  ],
  controllers: [TasksController],
  providers: [
    TasksService,
    TasksSchedulerService,
    TasksEdmsListener,
    TasksEscalationListener,
  ],
  exports: [TasksService],
})
export class TasksModule {}
