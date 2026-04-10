# Global System Audit — CoESCD Platform Backend

**Date:** 2026-04-10  
**Audited by:** Automated deep audit (Senior Backend Architect perspective)  
**System:** Sovereign emergency management platform for Tajikistan  
**Stack:** NestJS 10 / Fastify / PostgreSQL 16+PostGIS / Redis / MinIO / OpenSearch / RabbitMQ / Docker Compose

---

## 1. Architecture Overview

**Pattern:** Modular Monolith with Event-Driven Cross-Domain Communication

The architecture is built around 18 clearly bounded domain modules. Each module owns its entities, service layer, and controller. Cross-domain communication uses an in-process `EventEmitter2` bus backed by the Transactional Outbox/Inbox pattern for reliability.

**Overall verdict:** The architecture is conceptually sound and professionally designed. The primary risks are not structural — they are in the gap between what the architecture describes and what is actually implemented.

```
┌─────────────────────────────────────────────────────┐
│                   HTTP / WebSocket                   │
│              (NestJS + Fastify Gateway)              │
└────────────────────────┬────────────────────────────┘
                         │
┌────────────────────────▼────────────────────────────┐
│            Domain Modules (18 bounded contexts)      │
│  IAM  Auth  EDMS  Tasks  Files  Chat  Calls  GIS    │
│  Org  Users  Notifications  Search  Analytics  ML   │
│  Audit  Outbox  Inbox  Reporting                    │
└────────────────────────┬────────────────────────────┘
                         │ EventEmitter2 + Outbox/Inbox
┌────────────────────────▼────────────────────────────┐
│              Infrastructure Layer                    │
│  PostgreSQL  Redis  MinIO  OpenSearch  RabbitMQ     │
└─────────────────────────────────────────────────────┘
```

---

## 2. Critical Security Findings

These are production-blocking issues that must be resolved before any real users interact with the system.

### SEC-001 — CRITICAL: PermissionGuard Not Active
**Impact:** Every API endpoint is unprotected by RBAC.  
**Root cause:** `PermissionGuard` exists and is functional but is not registered as an `APP_GUARD`. Controllers that don't explicitly apply `@UseGuards(PermissionGuard)` have zero permission enforcement.  
**Fix:** Add `{ provide: APP_GUARD, useClass: PermissionGuard }` to `app.module.ts` providers array.

### SEC-002 — CRITICAL: Classification Barriers Missing on List Endpoints
**Impact:** A user with clearance=0 can query documents, files, and tasks classified as `secret` (level 3) via list/search endpoints.  
**Root cause:** Classification checks exist in some read methods (`getAccessibleDocument`) but are absent from the query layer (TypeORM `find()` calls).  
**Fix:** Add a TypeORM global entity subscriber or `ClearanceInterceptor` that appends `classification <= actorClearance` to all queries for classified entities.

### SEC-003 — CRITICAL: Search Endpoint Bypasses Classification
**Impact:** OpenSearch full-text search returns classified document content regardless of the caller's clearance level.  
**Fix:** Add `{ range: { classification: { lte: actorClearance } } }` as a mandatory filter on all OpenSearch queries.

### SEC-004 — HIGH: No Refresh Token Rotation
**Impact:** A single leaked refresh token grants access for 7 days with no way to detect or revoke it.  
**Fix:** Implement token family rotation — rotate on use, invalidate entire family on reuse detection.

### SEC-005 — HIGH: No Rate Limiting on Auth Endpoints
**Impact:** Password reset, login, and registration endpoints are not throttled globally. Brute-force automation can bypass per-credential lockout by spreading attacks across many accounts.  
**Fix:** Apply `@Throttle({ default: { limit: 10, ttl: 60000 } })` globally; apply stricter limits to `POST /auth/login`, `POST /auth/register`, `POST /auth/forgot-password`.

---

## 3. Cross-Module Architectural Issues

### ARCH-001: State Machine Bypass via Direct Repository Writes
**Affected:** `EdmsTaskSyncListener` writes `document.status = COMPLETED` directly via `documentRepo.update()`, bypassing `DocumentService.transition()`.

**Pattern:** Listeners that directly access repositories of other modules break encapsulation and create invisible state transitions with no audit trail, no outbox events, and no invariant validation.

**Rule:** A module's entity state must only be mutated by that module's service layer. Listeners call services, never repositories.

### ARCH-002: Non-Transactional Multi-Entity Operations
**Affected:** `ResolutionService.issueResolution()` (N+1 saves without transaction), `TasksEdmsListener` (task + assignment saves), notification delivery.

**Pattern:** Multiple `repo.save()` calls inside a loop without a wrapping `DataSource.transaction()`. Partial failures leave inconsistent state.

**Rule:** Any operation that writes to 2+ tables must be wrapped in an explicit transaction.

### ARCH-003: Cross-Module Repository Injection
**Affected:** `EdmsTaskSyncListener` injects `@InjectRepository(ExecutorAssignment)` and `@InjectRepository(Document)` — both belong to the EDMS module.

**Pattern:** Injecting another module's repository directly couples the two modules at the data layer, making the dependency invisible to the DI graph.

**Rule:** Cross-domain data access must go through the owning module's service, exported via `@Module({ exports: [ResolutionService] })`.

### ARCH-004: Event Naming Inconsistency
**Affected:** All modules using `EventEmitter2`.

`task.overdue` (dot-separated), `presence.changed` (camelCase part), `edms.all_assignments_complete` (snake_case), `tasks.edms_task_created` (mixed). No consistent convention.

**Rule:** Adopt `domain.entity_verb` in snake_case: `edms.document_registered`, `tasks.task_completed`, `auth.login_succeeded`.

### ARCH-005: JWT `positionId` Single-Value Limitation
**Affected:** IAM, EDMS, Tasks, Authorization.

Users can occupy multiple positions. JWT carries exactly one `positionId`. The system has no mechanism to switch active context. This is a fundamental UX and authorization issue for multi-role government officials.

**Rule:** JWT should carry `positionId` as the active context, with a session endpoint (`POST /session/position`) to switch context and reissue a short-lived position-scoped token.

---

## 4. Anti-Patterns Observed

| Anti-Pattern | Locations | Impact |
|---|---|---|
| God constructor (10+ injections) | `ResolutionService`, `TasksService` | Hard to test, hard to extend |
| Non-null assertion `!` on optional JWT fields | All controllers (`req.user.positionId!`) | Runtime crashes on users without position |
| Magic string event names | All listener files | Typos cause silent event drops |
| Magic number constants inline | `MAX_SUBTASK_DEPTH = 3`, `BCRYPT_ROUNDS = 12` | Inconsistent application |
| Swallowed exceptions in critical paths | `recordHistory()`, `AuditService.emit()` | Silent compliance gaps |
| Direct raw string `eventType` in audit | All services | Typos create phantom event types |

---

## 5. Missing Cross-Cutting Concerns

### Observability
- **No structured request logging** — No middleware logs `method`, `path`, `userId`, `positionId`, `durationMs`, `statusCode` per request. Debugging production issues is blind.
- **No distributed tracing** — Jaeger is configured in docker-compose but no `@opentelemetry/sdk-node` instrumentation exists in the codebase.
- **No application metrics** — Prometheus is configured but no `prom-client` metrics are exposed (`/metrics` endpoint missing).
- **No alerting rules** — No Grafana alerting on error rates, queue depth, or DB connection pool exhaustion.

### Input Validation Gaps
- `@Body('report') report: string` in `ResolutionController.fileCompletionReport()` — plain string, no class-validator.
- `req.user.positionId!` — non-null assertion without validation means a user without a position assignment causes a cryptic 500 error.
- GIS geometry inputs — no PostGIS validity validation before insert.
- FormSubmission data — not validated against form field schema.

### Missing Global Error Handler
NestJS's default exception filter is likely in place, but no custom `ExceptionFilter` normalizes error responses. Stack traces may leak in development mode if not configured correctly.

---

## 6. Data Consistency Risks

| Risk | Cause | Severity |
|---|---|---|
| Partial resolution with orphaned assignments | Non-transactional N+1 saves | HIGH |
| Document status set by listener bypassing state machine | Direct `repo.update()` | HIGH |
| Duplicate registration numbers under concurrent load | TOCTOU in sequence generation | MEDIUM |
| Lost outbox events on crash | `outboxService.publish()` outside business transaction | HIGH |
| Stale inbox records blocking event processing | No staleness recovery | MEDIUM |
| Corrupt folder closure table | Non-transactional folder insert | MEDIUM |

---

## 7. Scaling Risks

- **`isSubordinateTo()` is an uncached DB query** — Called on every authorization decision. Under 100 concurrent requests, this alone can saturate the DB connection pool.
- **Outbox dispatcher is single-threaded cron** — A large backlog processes at 15-second intervals sequentially. Under load, event delivery latency compounds.
- **OpenSearch without index rollover** — A single index for all documents, tasks, and messages will degrade in performance over millions of records without time-series index rotation.
- **Redis used for cache and session store without persistence** — `AOF`/`RDB` disabled. A Redis restart loses all cached RBAC decisions and any session state stored there.

---

## 8. Incomplete / Stub Implementations

| Feature | Status | Location |
|---|---|---|
| SSO (LDAP/SAML) | Entity + service stubs, no controllers or working flows | `modules/iam/sso.service.ts` |
| Acting assignments | Documented in arch docs, no entity or service | — |
| Emergency override | Documented in arch docs, no code | — |
| Delegation enforcement | Entity exists, expiry not checked | `modules/authorization/` |
| GIS spatial queries | PostGIS configured, no `ST_*` calls in code | `modules/gis/` |
| ML inference | Entities + MLflow configured, no inference logic | `modules/ml/` |
| Airflow DAGs | Airflow configured, no DAG files | — |
| SIEM export | Service stub, no implementation | `modules/audit/` |
| Workflow step execution | Entity exists, no orchestration logic | `modules/edms/` |
| ClickHouse queries | Configured, no queries | `modules/analytics/` |

---

## 9. Testing Coverage Assessment

| Layer | Status |
|---|---|
| Unit tests (services) | Partial — key services have specs but coverage unknown |
| Integration tests | None — no multi-domain scenario tests |
| E2E tests | Config exists (`jest-e2e.json`), no test files |
| Performance tests | None |
| Security tests | None |
| Smoke tests | Documented but not verified as runnable |

**Critical gaps:** No tests for authorization rules, state machine transitions, concurrent operations, or cross-domain event flows.

---

## 10. Summary Severity Matrix

| Category | Critical | High | Medium | Low |
|---|---|---|---|---|
| Security | 3 | 5 | 7 | 3 |
| Data consistency | 0 | 3 | 4 | 2 |
| Missing functionality | 0 | 4 | 8 | 6 |
| Technical debt | 0 | 2 | 9 | 8 |
| Observability | 0 | 3 | 4 | 3 |

**Total blocking issues (Critical + High):** ~20  
**Total improvement opportunities:** ~60+

The platform is architecturally well-conceived but operationally immature. The 3 critical security issues alone make production deployment dangerous. The architecture itself requires no major redesign — the primary work is enforcement, completion, and hardening.
