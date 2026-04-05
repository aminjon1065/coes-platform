import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { FileRecord } from './entities/file-record.entity';
import { FileVersion } from './entities/file-version.entity';
import { FileFolder } from './entities/file-folder.entity';
import { FileLink } from './entities/file-link.entity';
import { FilePermission } from './entities/file-permission.entity';

import { MinioService } from './services/minio.service';
import { FilesService } from './services/files.service';
import { FilesController } from './controllers/files.controller';
import { FileScanListener } from './listeners/file-scan.listener';

import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      FileRecord,
      FileVersion,
      FileFolder,
      FileLink,
      FilePermission,
    ]),
    AuditModule,
  ],
  controllers: [FilesController],
  providers: [MinioService, FilesService, FileScanListener],
  exports: [FilesService, MinioService],
})
export class FilesModule {}
