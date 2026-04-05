import { Module } from '@nestjs/common';

import { SearchIndexService } from './services/search-index.service';
import { SearchQueryService } from './services/search-query.service';
import { SearchIndexingListener } from './listeners/search-indexing.listener';
import { SearchController } from './controllers/search.controller';

@Module({
  controllers: [SearchController],
  providers: [SearchIndexService, SearchQueryService, SearchIndexingListener],
  exports: [SearchIndexService, SearchQueryService],
})
export class SearchModule {}
