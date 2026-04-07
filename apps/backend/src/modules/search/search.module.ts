import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { Document } from '../edms/entities/document.entity';
import { Task } from '../tasks/entities/task.entity';
import { Message } from '../chat/entities/message.entity';
import { SearchIndexService } from './services/search-index.service';
import { SearchQueryService } from './services/search-query.service';
import { SearchMaintenanceService } from './services/search-maintenance.service';
import { SearchIndexingListener } from './listeners/search-indexing.listener';
import { SearchController } from './controllers/search.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Document, Task, Message])],
  controllers: [SearchController],
  providers: [SearchIndexService, SearchQueryService, SearchMaintenanceService, SearchIndexingListener],
  exports: [SearchIndexService, SearchQueryService, SearchMaintenanceService],
})
export class SearchModule {}
