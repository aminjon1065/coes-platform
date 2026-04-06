# ADR-002: NestJS 10 with Fastify Adapter

**Date:** 2026-01-15
**Status:** Accepted
**Deciders:** Platform Architecture Team

---

## Context

The backend framework choice determines development ergonomics, performance characteristics, and the long-term maintainability of a 40+ module codebase maintained by a small team.

Candidates evaluated:

| Framework | Notes |
|---|---|
| NestJS + Express | Most popular; large ecosystem; slower HTTP throughput |
| NestJS + Fastify | Same DX as above; 2–4× higher throughput on identical hardware |
| Hapi | Strong validation built-in; smaller ecosystem; less TypeScript-native |
| Fastify (bare) | Fastest; no opinionated structure; requires DIY DI, modules, guards |
| tRPC | Type-safe RPCs; requires TypeScript on frontend; not suitable for government API contracts |

## Decision

**NestJS 10 with `@nestjs/platform-fastify`** (Fastify v4 adapter).

## Rationale

**NestJS for structure:**

Government-grade systems are maintained for 10+ years, often by developers who did not write the original code. NestJS's opinionated module system, decorator-driven DI, and consistent controller → service → repository layering make the codebase navigable for new engineers without platform-specific onboarding.

Key features used extensively:
- `@Module()` with `forFeature()` / `forRoot()` for TypeORM entities
- `APP_GUARD` global guards (JWT, Permission)
- `@Global()` for cross-cutting services (AuditService, AuthorizationService)
- `@OnEvent()` for cross-domain listener decoupling
- `@Cron()` for scheduled tasks (ML monitoring, audit archival, analytics snapshots)
- `@InjectRepository()` for TypeORM repository injection

**Fastify over Express:**

- On identical hardware, Fastify processes ~45,000 req/s vs Express ~22,000 req/s (benchmark: wrk, 4-core VM). During a mass-casualty incident with many concurrent field devices, this margin matters.
- Fastify's schema-based serialization avoids accidental PII leakage by requiring explicit response shapes.
- `@fastify/multipart` handles file uploads without Express's `multer` memory model issues.

**Trade-offs accepted:**
- Some Express middleware (e.g., `passport-local` strategy) requires adaptation via Fastify-compatible wrappers. We accepted this cost given the performance benefit.
- `@nestjs/swagger` generates OpenAPI from decorators and works correctly with Fastify.

## Consequences

- All controllers use `FastifyRequest` / `FastifyReply` types instead of Express equivalents. New developers must be aware of this distinction when reading examples from the Express-centric NestJS documentation.
- File upload handling uses `@fastify/multipart` with manual field parsing; `@UploadedFile()` decorator (Express-only) is not used.
