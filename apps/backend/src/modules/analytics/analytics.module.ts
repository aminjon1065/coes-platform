import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { Incident } from './entities/incident.entity';
import { IncidentResponse } from './entities/incident-response.entity';
import { ResourceDeployment } from './entities/resource-deployment.entity';
import { DataCollectionForm } from './entities/data-collection-form.entity';
import { FormSubmission } from './entities/form-submission.entity';
import { GeneratedReport } from './entities/generated-report.entity';

import { AnalyticsService } from './services/analytics.service';
import { AnalyticsDomainListener } from './listeners/analytics-domain.listener';
import { AnalyticsController } from './controllers/analytics.controller';

import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Incident,
      IncidentResponse,
      ResourceDeployment,
      DataCollectionForm,
      FormSubmission,
      GeneratedReport,
    ]),
    AuditModule,
  ],
  controllers: [AnalyticsController],
  providers: [AnalyticsService, AnalyticsDomainListener],
  exports: [AnalyticsService],
})
export class AnalyticsModule {}
