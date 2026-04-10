# Module: Search

## Overview
Full-text search and indexing via OpenSearch 2.6+. Indexes documents, tasks, and chat messages via async event listeners. Provides full-text search with filters. Includes a maintenance service for index lifecycle management.

---

## Current Issues

- ❌ **No classification enforcement on search results** — OpenSearch does not natively enforce clearance levels. A search query for `content: "secret operation"` returns results regardless of the caller's clearance. The application must post-filter, but this is not implemented.
- ❌ **Field mapping not defined in code** — No explicit OpenSearch index mapping is created on startup. OpenSearch uses dynamic mapping (auto-detected types), which means `date` fields stored as strings, numeric fields treated as keywords, and relevance scoring that is not tuned for the domain.
- ❌ **Async listener can miss events** — If the `SearchIndexingListener` crashes or the EventEmitter queue is full during a burst, newly created documents/tasks are never indexed. There is no reconciliation path.
- ❌ **No reindex capability** — If the OpenSearch index is corrupted, dropped, or out of sync with Postgres, there is no mechanism to rebuild it from the DB source of truth.

---

## Missing Functionality

- 🚫 **Clearance filter applied at query time** — OpenSearch query must include a `must` clause: `{ range: { classification: { lte: actorClearance } } }`.
- 🚫 **Index bootstrap with explicit mappings** — On application startup, create indexes with defined mappings if they don't exist.
- 🚫 **Full reindex command** — Admin endpoint / CLI command that reads all entities from Postgres and bulk-inserts into OpenSearch.
- 🚫 **Search facets/aggregations** — Counts by status, type, date range for dashboard widgets.
- 🚫 **Highlighting** — Return matched field snippets with hit highlights for UI display.
- 🚫 **Relevance tuning** — Field boosting (title > body > metadata), function scores for recency.

---

## Technical Debt

- 🧱 **Index prefix config not used consistently** — If `OPENSEARCH_INDEX_PREFIX` is set, it must be applied to all index operations (create, search, delete). A missed prefix causes production queries to hit development indexes.
- 🧱 **`SearchIndexService` and `SearchQueryService` have no abstraction layer** — OpenSearch client calls are made directly. If the search backend changes (e.g., to Elasticsearch or Typesense), every call site must change.
- 🧱 **No error handling on index failures** — If `indexDocument()` fails (OpenSearch unavailable), the error is likely swallowed in the listener. Document is never indexed with no alerting.

---

## Risks

- 🔓 **Clearance bypass via search** — This is a direct security gap. A user with clearance=0 can search and discover the existence and content of secret-classified documents.
- 🔓 **Search index as data leak vector** — Indexed full text may include attachment contents, which are not re-checked for clearance at search time.

---

## Recommendations

- ✅ **Add clearance filter to ALL search queries:**
  ```typescript
  const query = {
    bool: {
      must: [userQuery],
      filter: [
        { range: { classification: { lte: actorClearance } } },
        { terms: { accessiblePositions: [actorPositionId] } }, // scope filter
      ],
    },
  };
  ```
- ✅ **Define explicit index mappings** in `search-index-mappings.ts`:
  ```typescript
  await this.client.indices.create({
    index: this.indexName('documents'),
    body: {
      mappings: {
        properties: {
          title: { type: 'text', analyzer: 'russian' },
          classification: { type: 'integer' },
          createdAt: { type: 'date' },
          status: { type: 'keyword' },
        },
      },
    },
  });
  ```
- ✅ **Add reindex admin endpoint:**
  ```typescript
  @Post('/admin/search/reindex/:indexName')
  @RequirePermission('search.reindex')
  async reindex(@Param('indexName') indexName: string) { ... }
  ```
- ✅ **Alert on indexing failures** — Catch errors in `SearchIndexingListener` and emit a `system.search_index_failed` event to the admin notification channel.
- ✅ **Implement reconciliation cron** — Daily job that compares Postgres counts with OpenSearch doc counts per index and logs discrepancies.
