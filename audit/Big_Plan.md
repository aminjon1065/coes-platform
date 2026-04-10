# Backend Refactoring Master Plan — CoESCD Platform

**Version:** 1.0  
**Date:** 2026-04-10  
**Estimated Phases:** 7  
**Priority Principle:** Security first → Correctness second → Completeness third → Performance fourth → Observability fifth → AI/ML last.

> Each task below is atomic and independently deployable. Start no new phase until all Critical items in the previous phase are complete.

---

## Phase 1 — Critical Security Fixes
> **Goal:** Make the system safe enough to test with real data.  
> **Exit criteria:** All SEC-00x findings from Global_Audit.md are resolved and verified.

### 1.1 Register `PermissionGuard` as Global Guard
**File:** `apps/backend/src/app.module.ts`
```typescript
providers: [
  { provide: APP_GUARD, useClass: JwtAuthGuard },
  { provide: APP_GUARD, useClass: PermissionGuard }, // ADD
],
```
Then audit every controller for `@RequirePermission()` decorator presence. Add missing decorators.  
**Test:** A request to `POST /edms/documents/:id/resolutions` with a role that lacks `document.resolution.issue` must return 403.

### 1.2 Add Classification Filter to All Data-Access Queries
**Approach:** Create a `ClearanceInterceptor` or TypeORM subscriber.
- Option A (preferred): Add `WHERE classification <= :clearance` to all `find()`/`findOne()` queries in document, file, task, and chat services by extracting clearance from request context.
- Option B: TypeORM global filter using `@EventSubscriber()` that appends the condition automatically.

Key files to fix:
- `modules/edms/services/document.service.ts` — list/query endpoints
- `modules/files/services/files.service.ts` — file list/download
- `modules/tasks/services/tasks.service.ts` — task list/query

**Test:** User with clearance=1 queries document list; documents with classification=2 and classification=3 must not appear.

### 1.3 Fix OpenSearch Classification Filter
**File:** `modules/search/services/search-query.service.ts`

Add mandatory clearance and scope filter to every query:
```typescript
filter: [
  { range: { classification: { lte: actorClearance } } },
]
```

**Test:** Full-text search for a keyword in a secret document must return 0 results for a user with clearance < 3.

### 1.4 Implement Refresh Token Rotation
**Files:**
- `modules/iam/services/iam.service.ts` — `refreshTokens()` method
- `modules/iam/entities/refresh-token.entity.ts` — add `familyId`, `replacedByTokenId` fields

Logic:
1. On `POST /auth/refresh`, find the token record.
2. If token is already `used`, it was reused — invalidate the entire family (`family_id`).
3. If valid, mark it `used`, create a new refresh token in the same family, return new pair.

**Test:** Using a refresh token twice returns 401 on the second use.

### 1.5 Add Rate Limiting to Auth Endpoints
**File:** `apps/backend/src/app.module.ts` and auth controller.
```typescript
ThrottlerModule.forRoot([{ ttl: 60000, limit: 100 }]) // global
// On auth controller:
@Throttle({ default: { limit: 10, ttl: 60000 } }) // stricter
```
Apply to: `POST /auth/login`, `POST /auth/register`, `POST /auth/forgot-password`, `POST /auth/refresh`.

### 1.6 Add JWT Revocation Cache
**File:** New `modules/iam/services/token-revocation.service.ts`

On logout / password change / admin disable:
```typescript
await redis.set(`blocklist:${jti}`, '1', 'EX', remainingTtlSeconds);
```
In `JwtStrategy.validate()`:
```typescript
const revoked = await redis.get(`blocklist:${payload.jti}`);
if (revoked) throw new UnauthorizedException('Token has been revoked');
```

---

## Phase 2 — Data Consistency & Correctness
> **Goal:** No operation leaves the database in a partially updated state.

### 2.1 Wrap All Multi-Entity Operations in Transactions
Priority order:
1. `ResolutionService.issueResolution()` — wrap resolution + assignments + history in one transaction.
2. `TasksEdmsListener` — task creation from resolution events must be transactional.
3. `FilesService.createFolder()` — folder insert + closure table update in one transaction.
4. `OutboxService.publish()` — must accept and use the caller's `EntityManager`.

Pattern:
```typescript
await this.dataSource.transaction(async (manager) => {
  // all manager.save() calls here
  await this.outboxService.publish(event, payload, opts, manager);
});
```

### 2.2 Fix State Machine Bypass in EdmsTaskSyncListener
**File:** `apps/backend/src/modules/edms/listeners/edms-task-sync.listener.ts`

Replace:
```typescript
await this.documentRepo.update(documentId, { status: DocumentStatus.COMPLETED });
```
With:
```typescript
await this.documentService.transition(documentId, DocumentStatus.COMPLETED, actorId, 'auto_completed_by_tasks');
```

`DocumentService.transition()` must: validate the state machine, emit outbox event, emit audit event.

### 2.3 Fix Task Status Transition Race Condition
**File:** `modules/tasks/services/task-transition.service.ts` (new file, extracted from `tasks.service.ts`)

Use pessimistic row-level locking:
```typescript
await this.dataSource.transaction(async (manager) => {
  const task = await manager
    .createQueryBuilder(Task, 't')
    .setLock('pessimistic_write')
    .where('t.id = :id', { id: taskId })
    .getOneOrFail();
  // validate transition, update, save history — all inside this transaction
});
```

### 2.4 Fix Outbox Event Dispatch Order
**File:** `modules/outbox/services/outbox-dispatcher.service.ts`

Add `ORDER BY created_at ASC, id ASC` to the dispatcher query. Add `SKIP LOCKED` for safe parallel dispatch workers:
```sql
SELECT * FROM outbox.events
WHERE status = 'pending'
ORDER BY created_at ASC, id ASC
LIMIT 50
FOR UPDATE SKIP LOCKED
```

### 2.5 Add Inbox Stale Recovery Cron
**File:** `modules/inbox/services/inbox.service.ts`
```typescript
@Cron('*/5 * * * *')
async recoverStaleRecords() {
  await this.inboxRepo.update(
    { status: 'processing', updatedAt: LessThan(subMinutes(new Date(), 5)) },
    { status: 'pending', retryCount: () => 'retry_count + 1' },
  );
}
```

### 2.6 Fix Registration Number Generation
**File:** `modules/edms/services/registration.service.ts`

Use a PostgreSQL sequence per `(documentTypeCode, year)`:
```sql
-- On first use of a new type+year combination:
CREATE SEQUENCE IF NOT EXISTS reg_seq_<typeCode>_<year> START 1;
-- On each registration:
SELECT nextval('reg_seq_<typeCode>_<year>');
```
This is atomic and race-condition-free.

---

## Phase 3 — Authorization Hardening
> **Goal:** Every access decision is correctly enforced by the 4-layer model.

### 3.1 Enforce Delegation Expiry
**File:** `modules/authorization/services/authorization.service.ts`

In `can()` method, after loading delegation:
```typescript
if (delegation.expiresAt && delegation.expiresAt < new Date()) {
  return false; // expired delegation grants nothing
}
```

Add a daily cron to mark expired delegations inactive.

### 3.2 Implement Acting Assignments
New entity: `ActingAssignment { id, userId, primaryPositionId, actingPositionId, startAt, endAt, grantedById, isActive }`

In `AuthorizationService.can()`, check if the user has an active acting assignment before falling back to their primary position.

In `JwtStrategy.validate()`, include acting positions in the JWT `positions` claim.

### 3.3 Enforce `FilePermission.expires_at`
**File:** `modules/files/services/files.service.ts`

In `assertPermission()`:
```typescript
if (permission.expiresAt && permission.expiresAt < new Date()) {
  throw new ForbiddenException('File permission has expired');
}
```

### 3.4 Validate Co-Executor Authority
**File:** `modules/tasks/services/tasks.service.ts`

In `assertAssignmentAuthority()`, apply the same `orgService.isSubordinateTo()` check to all executor roles, not just `primary`.

### 3.5 Add Hierarchical Document Visibility for Superiors
**File:** `modules/edms/services/resolution.service.ts` — `hasDocumentVisibility()`

Add:
```typescript
const isSuperior = actorPositionId 
  ? await this.orgService.isSubordinateTo(document.createdByPositionId, actorPositionId)
  : false;
return (existing checks) || (isSuperior && actorClearance >= document.classification);
```

---

## Phase 4 — Feature Completion
> **Goal:** Core business workflows are fully implemented end-to-end.

### 4.1 Implement Workflow Step Execution Engine
New service: `modules/edms/services/workflow.service.ts`

Capabilities:
- `advanceWorkflow(documentId, actorId, action, comment)` — progress to next step
- Step routing: determine who must act at each step based on `WorkflowTemplate.stepDefinitions`
- Step timeout: emit `edms.workflow_step_overdue` when step deadline passes
- Auto-advance: skip steps that have no required actors

### 4.2 Complete SSO Integration
**File:** `modules/iam/services/sso.service.ts`

Add controllers for:
- `GET /auth/sso/providers` — list active SSO configurations
- `POST /auth/sso/saml/login` — initiate SAML flow
- `POST /auth/sso/saml/callback` — handle SAML assertion
- `POST /auth/sso/ldap/login` — LDAP bind + user resolution

Use `passport-saml` and `ldapjs` packages.

### 4.3 Implement Notification Retry Queue
**Package:** Add `@nestjs/bull` + `bull`

Create `NotificationQueue` with:
- 3 retry attempts with exponential backoff (5s, 30s, 5min)
- Dead-letter queue with admin alert on failure
- Per-channel processor classes

### 4.4 Add Position Switch Endpoint
**File:** `modules/iam/controllers/iam.controller.ts`

```typescript
@Post('/auth/position')
async switchPosition(@Body('positionId') positionId: string, @Req() req) {
  // validate user occupies or acts in this position
  // reissue short-lived token with new positionId claim
}
```

### 4.5 Add Task Deadline Reminders
New service: `modules/tasks/services/task-schedule.service.ts`

- Store `reminderSchedule: number[]` (minutes before deadline) on `TaskType`
- Cron runs every 5 minutes, queries tasks with upcoming deadlines
- Emits `task.deadline_reminder` events for `NotificationsService`

### 4.6 Implement ClamAV Download Gate + Cleanup
**Files:**
- `modules/files/services/files.service.ts` — `generateDownloadUrl()` must check `scanStatus === CLEAN`
- New cron in `modules/files/services/file-maintenance.service.ts`:
  - Re-queue stale scan jobs (pending > 10 min)
  - Delete `tmp/*` MinIO objects older than 2 hours (or rely on MinIO lifecycle policy)

### 4.7 Add Audit Search API
**File:** New `modules/audit/controllers/audit-query.controller.ts`

```typescript
@Get('/audit/events')
@RequirePermission('audit.read')
async queryEvents(@Query() filters: AuditQueryDto) { ... }
```

With pagination, date range, actorId, resourceType, severity filters.

---

## Phase 5 — Performance & Scaling
> **Goal:** System handles 100+ concurrent users without DB saturation.

### 5.1 Cache `isSubordinateTo()` in Redis
**File:** `modules/org/services/org.service.ts`

Cache key: `org:sub:{childId}:{parentId}` TTL: 5 minutes.  
Invalidate: `SCAN org:sub:*` on any org structure change event.

### 5.2 Add Materialized Path to Department Hierarchy
**Migration:** Add `path ltree` column to `org.departments`.  
Update `OrgService` to use `path @> lquery` for ancestor/descendant queries instead of recursive CTE.  
Benchmark: Should reduce `isSubordinateTo()` from O(depth) to O(1).

### 5.3 Optimize Outbox Dispatcher
- Add `SKIP LOCKED` for parallel workers
- Add Redis wake-up signal on new event insertion (see outbox-inbox.md)
- Add Prometheus metric: `outbox_pending_events_total`, `outbox_dispatch_latency_ms`

### 5.4 Add DB Connection Pool Monitoring
Configure TypeORM pool size explicitly:
```typescript
extra: { max: 20, min: 5, idleTimeoutMillis: 30000 }
```
Expose pool metrics via Prometheus.

### 5.5 OpenSearch Index Optimization
- Define explicit index mappings with Russian/Tajik analyzers for full-text fields
- Add index rollover policy for time-based indexes
- Add daily reconciliation cron comparing Postgres counts with OpenSearch counts

### 5.6 Add Outbox / Inbox Retention Cleanup
- Delete completed outbox events older than 30 days (daily cron)
- Archive completed inbox records older than 90 days

---

## Phase 6 — Observability & Operations
> **Goal:** Engineers can diagnose any production issue within 5 minutes.

### 6.1 Structured Request Logging
**File:** New `apps/backend/src/common/interceptors/logging.interceptor.ts`

Log per request:
```json
{ "method": "POST", "path": "/edms/documents/uuid/resolutions", "userId": "...", "positionId": "...", "statusCode": 201, "durationMs": 45, "requestId": "..." }
```
Use `pino` or NestJS's built-in `Logger` with JSON format. Add `X-Request-ID` header propagation.

### 6.2 Prometheus Metrics Endpoint
**Package:** `prom-client`

Expose `/metrics` with:
- `http_requests_total{method, path, status}` counter
- `http_request_duration_seconds{method, path}` histogram
- `db_connection_pool_size{state}` gauge
- `outbox_pending_events_total` gauge
- `notification_delivery_total{channel, status}` counter

### 6.3 OpenTelemetry Distributed Tracing
**Package:** `@opentelemetry/sdk-node`, `@opentelemetry/auto-instrumentations-node`

Bootstrap in `main.ts` before module init. Export traces to Jaeger (already in docker-compose).  
This automatically instruments: HTTP requests, TypeORM queries, Redis calls, EventEmitter.

### 6.4 Health Check Endpoints
**Package:** `@nestjs/terminus` (likely already present)

Expose `GET /health` with indicators for:
- Database connectivity
- Redis connectivity
- MinIO connectivity
- OpenSearch connectivity
- RabbitMQ connectivity

### 6.5 Alert Rules (Grafana)
Define alerts for:
- Error rate > 1% for 5 minutes
- DB connection pool > 80% utilization for 2 minutes
- Outbox pending events > 100 for 10 minutes
- ClamAV scan pending > 50 for 15 minutes
- Dead-lettered outbox events > 0

### 6.6 Implement Hash Chain for Audit Log
**File:** `modules/audit/services/audit.service.ts`

Chain each event to the previous hash. Add daily integrity verification cron.  
Add `SIEM_EXPORT_ENABLED` feature flag and implement syslog/webhook export.

---

## Phase 7 — AI/ML Integration
> **Prerequisite:** All phases 1–6 complete and system is stable in production.

### 7.1 Wire MLflow Model Registry
Sync `MlModelVersion` entity with MLflow model registry via HTTP API.  
Create `MlModelRegistryService` that polls MLflow for new promoted model versions.

### 7.2 Risk Prediction Inference Service
Create a Python FastAPI microservice that:
- Loads model from MLflow by version ID
- Accepts incident feature vectors
- Returns risk score + SHAP explanation values

NestJS `MlService` calls this via HTTP. Cache predictions in Redis: `prediction:{modelVersion}:{incidentId}`.

### 7.3 Airflow DAGs for Training Pipeline
Write DAGs for:
1. Feature extraction from `incidents` and `resource_deployments` tables → ClickHouse
2. Model training with scikit-learn / XGBoost
3. Model evaluation and registration to MLflow
4. Promotion gate (manual approval required)

### 7.4 Anomaly Detection for Security
Apply behavioral analysis to the audit log:
- Unusual document access patterns (volume, time of day, classification spikes)
- Privilege escalation attempts
- Emit `security.anomaly_detected` events with severity scores

### 7.5 Smart Routing Suggestions
Based on historical workflow data, suggest:
- Optimal executor for a resolution (based on past completion rates)
- Predicted completion time for task types
- At-risk tasks before they become overdue

---

## Implementation Checklist Summary

| Phase | Tasks | Blocking? | Est. Effort |
|---|---|---|---|
| Phase 1 — Critical Security | 6 tasks | YES (prod-blocking) | 1–2 weeks |
| Phase 2 — Data Consistency | 6 tasks | YES (data corruption risk) | 1–2 weeks |
| Phase 3 — Auth Hardening | 5 tasks | YES (security gaps) | 1 week |
| Phase 4 — Feature Completion | 7 tasks | NO (functional gaps) | 3–4 weeks |
| Phase 5 — Performance | 6 tasks | NO (scaling prep) | 2 weeks |
| Phase 6 — Observability | 6 tasks | NO (ops readiness) | 2 weeks |
| Phase 7 — AI/ML | 5 tasks | NO (future roadmap) | 6–8 weeks |

**Total to production-ready (Phases 1–3):** ~4–5 weeks with a 2-engineer team  
**Total to v1.0 complete (Phases 1–6):** ~12–14 weeks  
**Total to AI/ML (Phase 7):** Additional 6–8 weeks after platform stability

---

## Suggested Team Task Assignment

```
Engineer A (Security focus):
  → Phase 1 entirely
  → Phase 3.1, 3.2 (delegation + acting)

Engineer B (Backend core focus):
  → Phase 2 entirely
  → Phase 3.3, 3.4, 3.5

After Phase 1–3 complete:
Engineer A → Phase 4.2 (SSO), 4.4 (position switch), 5.x
Engineer B → Phase 4.1 (workflow engine), 4.3 (notifications), 4.5–4.7
Both → Phase 6 (observability, split by component)
```
