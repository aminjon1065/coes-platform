import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { Document } from './entities/document.entity';
import { DocumentType } from './entities/document-type.entity';
import { DocumentVersion } from './entities/document-version.entity';
import { DocumentAttachment } from './entities/document-attachment.entity';
import { RegistrationRecord } from './entities/registration-record.entity';
import { WorkflowTemplate } from './entities/workflow-template.entity';
import { WorkflowStepDefinition } from './entities/workflow-step-definition.entity';
import { WorkflowInstance } from './entities/workflow-instance.entity';
import { WorkflowStep } from './entities/workflow-step.entity';
import { Resolution } from './entities/resolution.entity';
import { ExecutorAssignment } from './entities/executor-assignment.entity';
import { WorkflowHistory } from './entities/workflow-history.entity';

import { EdmsService } from './services/edms.service';
import { WorkflowService } from './services/workflow.service';
import { ResolutionService } from './services/resolution.service';

import { EdmsController } from './controllers/edms.controller';
import { DocumentTypesController } from './controllers/document-types.controller';
import { WorkflowController } from './controllers/workflow.controller';
import { ResolutionController } from './controllers/resolution.controller';
import { EdmsWorkflowListener } from './listeners/edms-workflow.listener';
import { EdmsTaskSyncListener } from './listeners/edms-task-sync.listener';

import { AuditModule } from '../audit/audit.module';
import { UsersModule } from '../users/users.module';
import { OrgModule } from '../org/org.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Document,
      DocumentType,
      DocumentVersion,
      DocumentAttachment,
      RegistrationRecord,
      WorkflowTemplate,
      WorkflowStepDefinition,
      WorkflowInstance,
      WorkflowStep,
      Resolution,
      ExecutorAssignment,
      WorkflowHistory,
    ]),
    AuditModule,
    UsersModule,
    OrgModule,
  ],
  controllers: [EdmsController, DocumentTypesController, WorkflowController, ResolutionController],
  providers: [EdmsService, WorkflowService, ResolutionService, EdmsWorkflowListener, EdmsTaskSyncListener],
  exports: [EdmsService, WorkflowService, ResolutionService],
})
export class EdmsModule {}
