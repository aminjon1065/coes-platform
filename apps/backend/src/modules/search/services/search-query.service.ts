import { Injectable, Logger } from '@nestjs/common';
import { SearchIndexName, SearchIndexService } from './search-index.service';

export interface SearchHit {
  index: SearchIndexName;
  id: string;
  score: number;
  source: Record<string, unknown>;
}

export interface SearchResult {
  total: number;
  hits: SearchHit[];
  took: number;
}

@Injectable()
export class SearchQueryService {
  private readonly logger = new Logger(SearchQueryService.name);

  constructor(private readonly indexService: SearchIndexService) {}

  /**
   * Unified full-text search across selected indices.
   *
   * Classification enforcement: documents/tasks/messages with
   * classification > userClearance are always filtered out.
   */
  async search(opts: {
    query: string;
    indices?: SearchIndexName[];
    userClearance: number;
    limit?: number;
    offset?: number;
  }): Promise<SearchResult> {
    const targetIndices = (opts.indices ?? Object.values(SearchIndexName)).map((n) =>
      this.indexService.indexName(n),
    );

    const limit  = opts.limit ?? 10;
    const offset = opts.offset ?? 0;

    const body = {
      query: {
        bool: {
          must: [
            {
              multi_match: {
                query: opts.query,
                fields: [
                  'subject^3',     // boost document subject
                  'title^3',       // boost task title
                  'body',
                  'description',
                  'registrationNumber^2',
                  'typeName',
                ],
                type: 'best_fields',
                fuzziness: 'AUTO',
                prefix_length: 2,
              },
            },
          ],
          filter: [
            // Classification gate — always applied, cannot be bypassed
            { range: { classification: { lte: opts.userClearance } } },
          ],
        },
      },
      highlight: {
        fields: {
          subject:            { number_of_fragments: 1, fragment_size: 150 },
          title:              { number_of_fragments: 1, fragment_size: 150 },
          body:               { number_of_fragments: 2, fragment_size: 200 },
          description:        { number_of_fragments: 1, fragment_size: 200 },
        },
        pre_tags:  ['<mark>'],
        post_tags: ['</mark>'],
      },
      _source: true,
      size: limit,
      from: offset,
    };

    try {
      const client = this.indexService.getClient();
      const response = await client.search({
        index: targetIndices.join(','),
        body,
      });

      const raw = response.body;
      const hits: SearchHit[] = (raw.hits?.hits ?? []).map((h: any) => ({
        index: this.parseIndexName(h._index),
        id: h._id,
        score: h._score,
        source: { ...h._source, highlights: h.highlight ?? null },
      }));

      return {
        total: typeof raw.hits?.total === 'object' ? raw.hits.total.value : (raw.hits?.total ?? 0),
        hits,
        took: raw.took ?? 0,
      };
    } catch (err) {
      this.logger.error(`Search query failed: ${(err as Error).message}`);
      return { total: 0, hits: [], took: 0 };
    }
  }

  /**
   * Search within a single channel (for chat history search).
   */
  async searchMessages(opts: {
    query: string;
    channelId: string;
    userClearance: number;
    limit?: number;
    offset?: number;
  }): Promise<SearchResult> {
    const body = {
      query: {
        bool: {
          must: [
            {
              match: {
                body: {
                  query: opts.query,
                  fuzziness: 'AUTO',
                  prefix_length: 2,
                },
              },
            },
          ],
          filter: [
            { term: { channelId: opts.channelId } },
            { range: { classification: { lte: opts.userClearance } } },
          ],
        },
      },
      highlight: {
        fields: { body: { number_of_fragments: 2, fragment_size: 200 } },
        pre_tags:  ['<mark>'],
        post_tags: ['</mark>'],
      },
      sort: [{ createdAt: { order: 'desc' } }],
      size: opts.limit ?? 20,
      from: opts.offset ?? 0,
    };

    try {
      const client = this.indexService.getClient();
      const response = await client.search({
        index: this.indexService.indexName(SearchIndexName.MESSAGES),
        body,
      });

      const raw = response.body;
      const hits: SearchHit[] = (raw.hits?.hits ?? []).map((h: any) => ({
        index: SearchIndexName.MESSAGES,
        id: h._id,
        score: h._score,
        source: { ...h._source, highlights: h.highlight ?? null },
      }));

      return {
        total: typeof raw.hits?.total === 'object' ? raw.hits.total.value : (raw.hits?.total ?? 0),
        hits,
        took: raw.took ?? 0,
      };
    } catch (err) {
      this.logger.error(`Message search failed: ${(err as Error).message}`);
      return { total: 0, hits: [], took: 0 };
    }
  }

  private parseIndexName(fullIndexName: string): SearchIndexName {
    for (const name of Object.values(SearchIndexName)) {
      if (fullIndexName.endsWith(`-${name}`)) return name;
    }
    return fullIndexName as SearchIndexName;
  }
}
