import { Module, Global } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditEvent } from './entities/audit-event.entity';
import { AuditArchive } from './entities/audit-archive.entity';
import { AuditService } from './services/audit.service';
import { SiemExportService } from './services/siem-export.service';
import { IamAuditListener } from './listeners/iam-audit.listener';
import { AuditController } from './controllers/audit.controller';

@Global()
@Module({
  imports: [TypeOrmModule.forFeature([AuditEvent, AuditArchive])],
  controllers: [AuditController],
  providers: [AuditService, SiemExportService, IamAuditListener],
  exports: [AuditService, SiemExportService],
})
export class AuditModule {}
