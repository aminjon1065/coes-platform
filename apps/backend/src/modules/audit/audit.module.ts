import { Module, Global } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditEvent } from './entities/audit-event.entity';
import { AuditService } from './services/audit.service';
import { IamAuditListener } from './listeners/iam-audit.listener';

@Global()
@Module({
  imports: [TypeOrmModule.forFeature([AuditEvent])],
  providers: [AuditService, IamAuditListener],
  exports: [AuditService],
})
export class AuditModule {}
