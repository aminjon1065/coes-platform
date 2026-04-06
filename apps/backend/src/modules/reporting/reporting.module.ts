import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { ReportDefinition } from './entities/report-definition.entity';
import { ReportExecution } from './entities/report-execution.entity';
import { ReportingService } from './services/reporting.service';
import { ReportingController } from './controllers/reporting.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([ReportDefinition, ReportExecution]),
  ],
  controllers: [ReportingController],
  providers: [ReportingService],
  exports: [ReportingService],
})
export class ReportingModule {}
