import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { Document } from './entities/document.entity';
import { DocumentType } from './entities/document-type.entity';
import { DocumentVersion } from './entities/document-version.entity';
import { DocumentAttachment } from './entities/document-attachment.entity';
import { RegistrationRecord } from './entities/registration-record.entity';

import { EdmsService } from './services/edms.service';
import { EdmsController } from './controllers/edms.controller';

import { AuditModule } from '../audit/audit.module';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Document,
      DocumentType,
      DocumentVersion,
      DocumentAttachment,
      RegistrationRecord,
    ]),
    AuditModule,
    UsersModule,
  ],
  controllers: [EdmsController],
  providers: [EdmsService],
  exports: [EdmsService],
})
export class EdmsModule {}
