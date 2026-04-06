# ADR-003: TypeORM 0.3 with PostgreSQL 16 + PostGIS + TimescaleDB

**Date:** 2026-01-15
**Status:** Accepted
**Deciders:** Platform Architecture Team

---

## Context

The platform requires:
1. A relational ORM for the core domain model (13 schemas, 80+ tables)
2. Spatial query support for GIS features (bounding box, radius, ST_DWithin)
3. Time-series storage for analytics snapshots and ML feature data
4. Full-text search for EDMS documents

Candidates evaluated:

| ORM | Notes |
|---|---|
| TypeORM 0.3 | Decorator-based, tight NestJS integration, mature |
| Prisma | Schema-first, excellent DX, weaker for complex PostGIS queries |
| MikroORM | Good TypeScript support, less widely known |
| Knex (query builder) | Maximum flexibility, no ORM abstractions, higher boilerplate |

## Decision

**TypeORM 0.3** as the ORM, **PostgreSQL 16** as the primary database, with:
- **PostGIS 3.4** extension for spatial data
- **TimescaleDB 2.x** as a co-located extension for time-series analytics
- **pg_trgm + btree_gin** extensions for trigram full-text search (EDMS)

## Rationale

**TypeORM:**

NestJS's `@nestjs/typeorm` integration is first-class and deeply tested. The decorator-based entity model (`@Entity`, `@Column`, `@OneToMany`, etc.) colocates schema definition with the domain model, reducing the cognitive distance between migration SQL and application code.

TypeORM's `QueryBuilder` is essential for the complex spatial queries in GIS (e.g., `ST_DWithin` with UTM reprojection, `ST_Intersects` on hazard zones). Prisma's raw query escaping for PostGIS functions is less ergonomic.

Tree entities (`@Tree('closure-table')`) are used for the organisational hierarchy in the Org module — TypeORM has built-in support for this pattern.

**Why not Prisma?**

Prisma's schema-first approach and migration system are excellent for simple CRUD but become cumbersome when:
- Mixing schemas (13 PostgreSQL schemas with cross-schema foreign keys)
- Integrating PostGIS geometry types (requires raw type overrides)
- Using TypeORM-specific patterns like tree entities, advisory locks, and partial indices

**PostgreSQL 16:**

The platform requires JSONB for flexible SSO attributes, workflow metadata, and ML model configs. PostgreSQL's JSONB with `@>` containment operators and GIN indices provides efficient document-style querying without a separate document store.

`pg_trgm` enables fuzzy full-text search on document titles and content without requiring Elasticsearch/OpenSearch for basic EDMS search (OpenSearch is still deployed for cross-entity full-text search).

**TimescaleDB:**

Analytics snapshots (hourly incident counts, resource utilisation, response time percentiles) are stored in TimescaleDB hypertables partitioned by time. This allows:
- Automatic chunk pruning for data retention
- `time_bucket()` aggregate queries for trend analysis at 10–100× the speed of equivalent PostgreSQL queries on large datasets
- Continuous aggregates for pre-computed hourly/daily summaries

TimescaleDB runs as a PostgreSQL extension in the same container (not a separate service), preserving the single-database operational model.

## Consequences

- TypeORM migration files are the source of truth for schema changes. All schema modifications go through numbered migrations in `apps/backend/src/infra/database/migrations/`.
- PostGIS operations are expressed as raw SQL within TypeORM's `QueryBuilder`. Team members must understand basic PostGIS functions (`ST_DWithin`, `ST_Intersects`, `ST_GeomFromGeoJSON`, `ST_Transform`).
- TimescaleDB hypertables require `CREATE EXTENSION timescaledb` before migrations run — handled in the Docker entrypoint and K8s init job.
- TypeORM's N+1 problem requires careful use of `leftJoinAndSelect` or explicit `relations` arrays in `findOne` calls.
