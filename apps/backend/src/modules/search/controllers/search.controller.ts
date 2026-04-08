import {
  Controller,
  Get,
  Post,
  Query,
  Req,
  ParseUUIDPipe,
  Param,
  Body,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { FastifyRequest } from 'fastify';

import { SearchQueryService } from '../services/search-query.service';
import { SearchQueryDto } from '../dto/search-query.dto';
import { ReindexSearchDto } from '../dto/reindex-search.dto';
import {
  SearchMaintenanceService,
  type SearchReindexResult,
} from '../services/search-maintenance.service';
import { CurrentUser, AuthenticatedUser } from '../../iam/decorators/current-user.decorator';
import { AuditService } from '../../audit/services/audit.service';
import { AuditSeverity } from '../../audit/entities/audit-event.entity';

interface AuthenticatedRequest extends FastifyRequest {
  user: {
    sub: string;
    clearance: number;
    positionId?: string;
  };
}

@ApiTags('Search')
@ApiBearerAuth()
@Controller({ path: 'search', version: '1' })
export class SearchController {
  constructor(
    private readonly searchQueryService: SearchQueryService,
    private readonly searchMaintenanceService: SearchMaintenanceService,
    private readonly auditService: AuditService,
  ) {}

  /**
   * Unified full-text search across documents, tasks, and messages.
   * Results are always filtered by the caller's clearance level.
   */
  @Get()
  @ApiOperation({ summary: 'Full-text search across documents, tasks, and messages' })
  search(@Query() query: SearchQueryDto, @Req() req: AuthenticatedRequest) {
    return this.searchQueryService.search({
      query: query.q,
      indices: query.indices,
      userClearance: req.user.clearance ?? 0,
      limit: query.limit,
      offset: query.offset,
    });
  }

  /**
   * Search within a specific channel's message history.
   * Useful for the in-app chat search UX (separate from the global search).
   */
  @Get('channels/:channelId/messages')
  @ApiOperation({ summary: 'Search message history within a channel' })
  searchChannelMessages(
    @Param('channelId', ParseUUIDPipe) channelId: string,
    @Query('q') q: string,
    @Query('limit') limit: string | undefined,
    @Query('offset') offset: string | undefined,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.searchQueryService.searchMessages({
      query: q ?? '',
      channelId,
      userClearance: req.user.clearance ?? 0,
      limit:  limit  ? parseInt(limit,  10) : 20,
      offset: offset ? parseInt(offset, 10) : 0,
    });
  }

  @Get('admin/health')
  @ApiOperation({ summary: 'Get OpenSearch connectivity and index readiness' })
  getHealth() {
    return this.searchMaintenanceService.getHealth();
  }

  @Post('admin/reindex')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Run a repository-backed search reindex/backfill' })
  async reindex(
    @Body() dto: ReindexSearchDto,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<SearchReindexResult> {
    const result = await this.searchMaintenanceService.reindex(dto);
    await this.auditService.emit({
      actorId: actor.id,
      eventType: 'admin.search.reindex',
      resourceType: 'search-index',
      success: true,
      severity: AuditSeverity.INFO,
      metadata: {
        indices: result.indices,
        batchSize: result.batchSize,
      },
    });
    return result;
  }
}
