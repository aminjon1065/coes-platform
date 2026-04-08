# CoESCD Platform — Detailed Implementation Plan

> Generated: 2026-04-08 · Last updated: 2026-04-08
> Platform: CoESCD Unified Digital Platform (Tajikistan Emergency Management)
> Stack: NestJS monorepo · PostgreSQL/PostGIS · Next.js 15 · Mediasoup · MapLibre

---

## Implementation Progress

| Phase | Status | Completed |
|---|---|---|
| Phase 1 — Auth & Security Hardening | ✅ Done | Step 1.1 MFA/TOTP |
| Phase 2 — Notifications & Push | ✅ Done | Step 2.1 Web Push · 2.2 Telegram · 2.3 SMS |
| Phase 3 — GIS Advanced + Field PWA | 🔲 Next | — |
| Phase 4 — Analytics + Reporting | 🔲 Pending | — |
| Phase 5 — ML + Airflow Pipelines | 🔲 Pending | — |
| Phase 6 — Admin UI + Search Hardening | 🔲 Pending | — |
| Phase 7 — Production Hardening & Testing | 🔲 Pending | — |

---

## Current State Summary

| Layer | Status |
|---|---|
| Database schemas (19 domains, 70+ tables) | ✅ Complete |
| NestJS module scaffolding (entities, DTOs, services) | ✅ Complete |
| Auth (JWT, RBAC, Audit, Org, Users) | ✅ Complete |
| EDMS + Workflow engine | ✅ Complete |
| Tasks module | ✅ Complete |
| Files + MinIO storage | ✅ Complete |
| Chat (channels, messages, presence) | ✅ Complete |
| Calls (Mediasoup SFU) | ✅ Complete |
| GIS basic (spatial layers, incidents) | ✅ Complete |
| WebSocket Gateway | ✅ Complete |
| Portal-Web (Next.js pages + API routes) | ✅ Complete |
| Docker Compose + Helm charts | ✅ Complete |
| CI/CD pipelines | ✅ Complete |
| **MFA (TOTP)** | ✅ **Implemented** |
| **Web Push notifications** | ✅ **Implemented** |
| **Telegram notifications** | ✅ **Implemented** |
| SMS notifications | ✅ Backend complete · env config needed |
| LDAP / SAML SSO | ⚠️ Stub only |
| GIS advanced (clustering, heatmap, predictive) | ⚠️ Incomplete |
| Analytics / ClickHouse integration | ⚠️ Incomplete |
| Reporting engine (scheduled exports) | ⚠️ Incomplete |
| ML / risk predictions / MLflow | ⚠️ Stub only |
| Airflow DAGs | ❌ Empty |
| Field PWA offline sync | ⚠️ Incomplete |
| Admin UI (users/roles/departments pages) | ⚠️ Partial |

---

## Phase Overview

```
Phase 1 — Auth & Security Hardening       Weeks 1–3   ✅ DONE
Phase 2 — Notifications & Push            Weeks 4–5   ✅ DONE
Phase 3 — GIS Advanced + Field PWA        Weeks 6–8   ← NEXT
Phase 4 — Analytics + Reporting           Weeks 9–11
Phase 5 — ML + Airflow Pipelines          Weeks 12–15
Phase 6 — Admin UI + Search Hardening     Weeks 16–17
Phase 7 — Production Hardening & Testing  Weeks 18–20
```

---

## ✅ PHASE 1 — Auth & Security Hardening — COMPLETE

### ✅ Step 1.1 — MFA / TOTP

**Files created:**
```
apps/backend/src/infra/database/migrations/
  1712300020000-MfaSchema.ts              ✅ creates iam.mfa_credentials table
apps/backend/src/modules/iam/
  entities/mfa-credential.entity.ts      ✅ TypeORM entity
  dto/mfa.dto.ts                         ✅ MfaTokenDto, MfaVerifyStepDto, MfaVerifyBackupStepDto
  services/mfa.service.ts                ✅ initSetup · confirmSetup · disable ·
                                              issueMfaPendingToken · verifyAndIssueTokens ·
                                              verifyBackupAndIssueTokens
  controllers/mfa.controller.ts          ✅ 6 endpoints
apps/portal-web/src/
  app/(public)/verify-mfa/page.tsx       ✅ TOTP entry + backup code toggle
  app/(public)/verify-mfa/actions.tsx    ✅ server actions
  app/(secure)/settings/security/page.tsx    ✅ security settings server page
  app/(secure)/settings/security/MfaSetupPanel.tsx ✅ QR setup · enable · disable · backup codes
  app/api/auth/mfa/setup/route.ts        ✅
  app/api/auth/mfa/enable/route.ts       ✅
  app/api/auth/mfa/disable/route.ts      ✅
  app/api/auth/mfa/status/route.ts       ✅
```

**Files modified:**
```
apps/backend/src/modules/iam/
  services/iam.service.ts                ✅ login() → LoginResult union type, issueTokensForCredential()
  controllers/auth.controller.ts         ✅ login passes MFA token issuer callback
  strategies/jwt.strategy.ts             ✅ validate() attaches mfaEnabled
  decorators/current-user.decorator.ts   ✅ AuthenticatedUser gains mfaEnabled
  iam.module.ts                          ✅ registers MfaCredential, MfaService, MfaController
apps/portal-web/src/
  lib/auth.ts                            ✅ LoginOutcome union, storeMfaPendingToken, verifyMfaAndCreateSession
  app/(public)/login/actions.ts          ✅ redirects to /verify-mfa on mfa_required
  middleware.ts                          ✅ guards /verify-mfa, adds /settings to secure prefixes
```

**Login flow with MFA:**
```
POST /auth/login
  password OK + MFA enabled → { mfaRequired: true, mfaToken }
                                     │
                            store in portal_mfa_token cookie (5 min)
                                     │
                            redirect /verify-mfa
                                     │
                         user enters 6-digit TOTP
                                     │
                POST /iam/mfa/verify { mfaToken, totpCode }
                                     │
                          full TokenPair issued
                                     │
                          redirect /dashboard
```

---

### ⚠️ Step 1.2 — LDAP Integration — NOT YET STARTED

Stub exists at `apps/backend/src/modules/iam/services/ldap.service.ts`.

**Remaining work:**
```
apps/backend/src/infra/config/ldap.config.ts   ← New
apps/backend/src/modules/iam/services/ldap.service.ts ← Complete
apps/backend/src/modules/iam/controllers/auth.controller.ts ← Add LDAP login route
```

**Env vars needed:**
```
AUTH_PROVIDER=local           # local | ldap | saml
LDAP_URL=ldap://dc.example.com:389
LDAP_BASE_DN=dc=example,dc=com
LDAP_BIND_DN=cn=readonly,dc=example,dc=com
LDAP_BIND_PASSWORD=
LDAP_USER_FILTER=(sAMAccountName={{username}})
```

---

### ⚠️ Step 1.3 — SAML / SSO — NOT YET STARTED

Stubs exist: `saml.service.ts`, `sso.controller.ts`.

**Env vars needed:**
```
SAML_ENTRY_POINT=https://idp.example.gov.tj/saml/login
SAML_ISSUER=https://coescd.gov.tj
SAML_CERT=<base64>
SAML_PRIVATE_KEY=<base64>
SAML_CALLBACK_URL=https://coescd.gov.tj/api/auth/saml/callback
```

---

## ✅ PHASE 2 — Notifications & Push — COMPLETE

### ✅ Step 2.1 — Web Push Notifications

**Files created:**
```
apps/portal-web/public/sw.js                                  ✅ service worker
apps/portal-web/src/app/api/notifications/
  push-public-key/route.ts                                    ✅ proxy
  push-subscription/route.ts                                  ✅ GET/POST/DELETE proxy
  preferences/route.ts                                        ✅ GET/PATCH proxy
apps/portal-web/src/app/(secure)/settings/notifications/
  page.tsx                                                    ✅ server component
  PushToggle.tsx                                              ✅ subscribe/unsubscribe client component
  PreferencesForm.tsx                                         ✅ per-channel toggles + email throttle
```

**Files modified:**
```
apps/backend/src/modules/notifications/
  services/notification.service.ts  ✅ getVapidPublicKey() + CACHE_MANAGER + ConfigService injected
  controllers/notification.controller.ts  ✅ GET /notifications/push-public-key (public)
```

**Push flow:**
```
PushToggle.tsx
  → fetch VAPID key from /api/notifications/push-public-key
  → Notification.requestPermission()
  → sw.register('/sw.js') → pushManager.subscribe()
  → POST /api/notifications/push-subscription
  → stored in push_subscriptions table

Backend → web-push → browser endpoint
  → sw push event → showNotification()
  → sw notificationclick → navigate to actionUrl
```

---

### ✅ Step 2.2 — Telegram Notifications

**Files created:**
```
apps/portal-web/src/app/api/notifications/
  telegram-subscription/route.ts           ✅ GET/DELETE proxy
  telegram/link/route.ts                   ✅ GET → generate deep link
apps/portal-web/src/app/(secure)/settings/notifications/
  TelegramPanel.tsx                         ✅ link flow + polling + disconnect
```

**Files modified:**
```
apps/backend/src/infra/config/telegram.config.ts
  ✅ added botName, webhookSecret
apps/backend/src/modules/notifications/
  services/notification.service.ts
    ✅ generateTelegramLinkToken(userId) → Redis token (5 min TTL)
    ✅ handleTelegramWebhookUpdate(update) → link account via /start TOKEN
  controllers/notification.controller.ts
    ✅ GET  /notifications/telegram/link     (auth)
    ✅ POST /notifications/telegram/webhook  (public, secret header verified)
.env.example  ✅ added TELEGRAM_BOT_NAME, TELEGRAM_WEBHOOK_SECRET
```

**Telegram linking flow:**
```
User clicks "Connect Telegram"
  → GET /api/notifications/telegram/link
  → Backend: randomBytes token → Redis telegram_link:{token} = userId (300s TTL)
  → Returns deepLink: https://t.me/{botName}?start={token}
  → Portal opens bot link, polls /telegram-subscription every 2s for 60s

User opens bot → sends /start {token}
  → Telegram calls POST /notifications/telegram/webhook (X-Telegram-Bot-Api-Secret-Token verified)
  → Backend: get userId from Redis → registerTelegramSubscription()
  → Sends "Connected" confirmation to user's chat
  → Poll detects status=active → UI shows "Connected"
```

---

### ✅ Step 2.3 — SMS Notifications — Backend complete

Backend fully implemented (`sms-notification.provider.ts`). Activate with:

```
SMS_ENABLED=true
SMS_PROVIDER=eskiz           # or twilio
SMS_ESKIZ_EMAIL=...
SMS_ESKIZ_PASSWORD=...
SMS_FROM=CoESCD
```

No frontend UI needed — SMS is a background delivery channel, managed via preferences toggles.

---

## 🔲 PHASE 3 — GIS Advanced + Field PWA

### Step 3.1 — GIS Clustering

**Files to create:**
```
apps/backend/src/modules/gis/
  services/gis-clustering.service.ts
  controllers/gis.controller.ts          ← add GET /gis/clusters endpoint
  dto/gis-query.dto.ts                   ← add ClusterQueryDto
apps/map-client/src/
  components/Map/ClusterLayer.tsx
  api/gis.ts                             ← add fetchClusters()
```

**Key query:**
```sql
SELECT
  ST_X(ST_Centroid(ST_Collect(location))) AS lng,
  ST_Y(ST_Centroid(ST_Collect(location))) AS lat,
  COUNT(*) AS count,
  array_agg(id) AS incident_ids
FROM gis.incident_locations
WHERE location && ST_MakeEnvelope($1,$2,$3,$4, 4326)
  AND status != 'resolved'
GROUP BY ST_SnapToGrid(location, $5)   -- grid size from zoom level
```

**New endpoint:** `GET /api/gis/clusters?bbox=lng1,lat1,lng2,lat2&zoom=10`
Returns GeoJSON FeatureCollection.

---

### Step 3.2 — GIS Heatmap

**Files to create:**
```
apps/backend/src/modules/gis/services/gis-heatmap.service.ts
apps/map-client/src/components/Map/HeatmapLayer.tsx
```

**New endpoint:** `GET /api/gis/heatmap?bbox=...&from=ISO&to=ISO`

---

### Step 3.3 — GIS Incident Timeline

**Files to create:**
```
apps/backend/src/modules/gis/services/gis-analytics.service.ts
apps/map-client/src/components/Map/TimelineSlider.tsx
```

**New endpoint:** `GET /api/gis/analytics/timeline?granularity=day&from=...&to=...`

---

### Step 3.4 — Field PWA Offline Sync

**Files to create/modify:**
```
apps/field-pwa/src/
  lib/
    idb.ts          ← IndexedDB wrapper (stores: tasks, incidents_queue, sync_log)
    sync.ts         ← queueIncident(), flushQueue(), BackgroundSync registration
  pages/
    ReportIncidentPage.tsx   ← try POST → on failure queueIncident()
    TaskListPage.tsx         ← add offline indicator
  components/
    SyncStatus.tsx           ← pending count + last sync + manual sync button
  sw.ts                      ← complete BackgroundSync 'incident-sync' handler
```

**Sync flow:**
```
Submit incident (offline)
  → queueIncident(data) → IndexedDB incidents_queue (status: pending)
  → register BackgroundSync tag 'incident-sync'

Back online
  → SW sync event / window online event
  → flushQueue() → POST each pending item → mark synced
```

---

## 🔲 PHASE 4 — Analytics + Reporting

### Step 4.1 — ClickHouse Integration

**Files to create:**
```
apps/backend/src/infra/clickhouse/
  clickhouse.module.ts
  clickhouse.service.ts
apps/backend/src/modules/analytics/
  services/
    analytics-writer.service.ts   ← listens to domain events, batch-inserts to ClickHouse
    analytics-query.service.ts    ← query aggregations
  controllers/analytics.controller.ts  ← complete
```

**ClickHouse tables:**
```sql
CREATE TABLE coescd_ml.events (
  event_type   LowCardinality(String),
  entity_type  LowCardinality(String),
  entity_id    UUID,
  actor_id     UUID,
  department_id UUID,
  metadata     String,
  occurred_at  DateTime64(3)
) ENGINE = MergeTree() ORDER BY (event_type, occurred_at);

CREATE TABLE coescd_ml.incident_features (
  incident_id  UUID,
  lat          Float64,
  lng          Float64,
  severity     UInt8,
  department_id UUID,
  hour_of_day  UInt8,
  day_of_week  UInt8,
  occurred_at  DateTime64(3)
) ENGINE = MergeTree() ORDER BY occurred_at;
```

**New endpoints:**
- `GET /api/analytics/incidents/trends?from=&to=&granularity=day`
- `GET /api/analytics/departments/:id/kpis`
- `GET /api/analytics/tasks/completion-rate?department=&period=30d`

---

### Step 4.2 — Reporting Engine

**Files to create:**
```
apps/backend/src/modules/reporting/
  services/
    report-executor.service.ts      ← complete
    report-scheduler.service.ts     ← NestJS @Cron() per definition
    report-renderer.service.ts      ← renderXlsx (exceljs) + renderPdf (pdfkit) + renderCsv
apps/portal-web/src/app/(secure)/reporting/
  page.tsx        ← complete
  [id]/page.tsx   ← complete with download button
```

**Install (backend):**
```bash
npm install exceljs pdfkit
npm install -D @types/pdfkit
```

**Execution flow:**
```
ReportSchedulerService (@Cron) → ReportExecutorService.execute(definitionId)
  → run query template via QueryRunner
  → ReportRendererService.render(rows, format)
  → store file in MinIO via FilesService
  → update report_executions (status: completed, fileId)
  → notify requester via NotificationService
```

---

## 🔲 PHASE 5 — ML + Airflow Pipelines

### Step 5.1 — MLflow Integration

**Files to create:**
```
apps/backend/src/modules/ml/
  services/
    mlflow.service.ts                ← HTTP client to MLflow REST API
    risk-prediction.service.ts       ← complete
    feature-engineering.service.ts   ← build feature vectors
  controllers/ml.controller.ts       ← complete
apps/map-client/src/components/ML/
  RiskOverlay.tsx                    ← choropleth by risk score
```

**New endpoints:**
- `GET /api/ml/risk/departments` → current risk scores
- `GET /api/ml/risk/map` → GeoJSON with scores per admin area
- `GET /api/ml/models` → registered model list
- `GET /api/ml/models/:name/performance` → accuracy metrics

---

### Step 5.2 — Airflow DAGs

**Files to create:**
```
apps/pipelines/dags/
  sync_incident_features.py   schedule: */15 * * * *
  train_risk_model.py         schedule: 0 2 * * *
  export_daily_analytics.py   schedule: 0 6 * * *
  archive_audit_events.py     schedule: 0 3 * * 0
  cleanup_old_files.py        schedule: 0 4 * * *
apps/pipelines/plugins/
  coescd_hooks.py
  coescd_operators.py
```

| DAG | Schedule | Purpose |
|---|---|---|
| `sync_incident_features` | `*/15 * * * *` | PG → ClickHouse feature sync |
| `train_risk_model` | `0 2 * * *` | Nightly model retraining |
| `export_daily_analytics` | `0 6 * * *` | Daily KPI report |
| `archive_audit_events` | `0 3 * * 0` | Weekly audit archival |
| `cleanup_old_files` | `0 4 * * *` | Orphan file cleanup |

---

## 🔲 PHASE 6 — Admin UI + Search Hardening

### Step 6.1 — Admin Users Page

**File:** `apps/portal-web/src/app/(secure)/admin/users/page.tsx`

Required features:
- Data table with server-side pagination/sort/search
- Filters: department, status, role
- Create / Edit modal
- Assign role with expiry date
- Assign position from department tree
- Lock / Unlock / Offboard actions
- Guard: `useRequireCapability('admin.users.manage')`

---

### Step 6.2 — Admin Departments Page

**File:** `apps/portal-web/src/app/(secure)/admin/departments/page.tsx`

Required features:
- Collapsible tree view
- Inline "Add child" per node
- Edit: name (ru/en/tj), code, parent
- Delete with cascade count warning

---

### Step 6.3 — Admin Roles Page

**File:** `apps/portal-web/src/app/(secure)/admin/roles/page.tsx`

Required features:
- Role list with user count
- Create/edit role with description
- Capability matrix (checkboxes by domain)
- "Users with this role" preview

---

### Step 6.4 — System Health Page

**File:** `apps/portal-web/src/app/(secure)/admin/system/page.tsx`

Required features:
- Service status cards (PostgreSQL, Redis, RabbitMQ, MinIO, OpenSearch, Gateway, Media)
- Storage usage bars
- Active WebSocket session count
- Recent error log tail
- "Trigger reindex" button
- Auto-refresh every 30 seconds

---

### Step 6.5 — Search Hardening

**Files to modify:**
```
apps/backend/src/modules/search/services/search.service.ts
apps/portal-web/src/app/(secure)/search/page.tsx
```

Additions:
- `icu_tokenizer` for Tajik/Russian/English
- Highlight matched terms (`<mark>`)
- Facet aggregations: type, department, date range, status
- Incremental re-index on update (not full re-index)
- `POST /api/admin/search/reindex?domain=edms|tasks|files`
- Portal: facet sidebar, highlighted snippets, `Ctrl+K` global shortcut

---

## 🔲 PHASE 7 — Production Hardening & Testing

### Step 7.1 — End-to-End Tests

**Files to create:**
```
apps/backend/test/e2e/
  auth.e2e-spec.ts
  mfa.e2e-spec.ts
  edms-workflow.e2e-spec.ts
  task-escalation.e2e-spec.ts
  gis-incident.e2e-spec.ts
  notifications.e2e-spec.ts
  search.e2e-spec.ts
  admin-users.e2e-spec.ts
```

Pattern: spin up test app → seed admin user → full HTTP flow via Supertest → assert DB state.

---

### Step 7.2 — Rate Limiting & Security Headers

**Files to modify:**
```
apps/backend/src/app.module.ts          ← ThrottlerModule auth limits
infra/docker/nginx/conf.d/api.conf      ← security headers
```

```
X-Frame-Options: SAMEORIGIN
X-Content-Type-Options: nosniff
Referrer-Policy: strict-origin-when-cross-origin
Content-Security-Policy: default-src 'self'; ...
Strict-Transport-Security: max-age=31536000; includeSubDomains
```

---

### Step 7.3 — Alerting Rules (Prometheus)

**File:** `infra/docker/prometheus/rules/coescd.rules.yml`

Alert rules to define:
- Backend: p99 latency > 2s for 5min
- Backend: error rate > 1% for 5min
- Database: connection pool > 80%
- Redis: memory > 75%
- RabbitMQ: queue depth > 10,000
- Disk: any volume > 80%
- Gateway: WebSocket connections drop > 50% in 1min

---

## Implementation Priority Matrix

| Priority | Module | Effort | Status |
|---|---|---|---|
| 🔴 P0 | MFA / TOTP | 3 days | ✅ Done |
| 🔴 P0 | Web Push Notifications | 2 days | ✅ Done |
| 🔴 P0 | Telegram Notifications | 2 days | ✅ Done |
| 🔴 P0 | Admin UI (users/roles/depts) | 4 days | 🔲 Next |
| 🟠 P1 | LDAP Integration | 3 days | 🔲 Pending |
| 🟠 P1 | GIS Clustering + Heatmap | 3 days | 🔲 Next |
| 🟠 P1 | Field PWA Offline Sync | 3 days | 🔲 Next |
| 🟠 P1 | Reporting Engine | 5 days | 🔲 Pending |
| 🟡 P2 | ClickHouse Analytics | 5 days | 🔲 Pending |
| 🟡 P2 | Airflow DAGs | 4 days | 🔲 Pending |
| 🟡 P2 | Search Facets + Highlighting | 2 days | 🔲 Pending |
| 🟢 P3 | ML / MLflow / Risk Predictions | 8 days | 🔲 Pending |
| 🟢 P3 | SAML SSO | 3 days | 🔲 Pending |
| 🟢 P3 | E2E Test Suite | 5 days | 🔲 Pending |
| 🟢 P3 | Prometheus Alerting | 1 day | 🔲 Pending |

**Effort remaining: ~49 developer-days**

---

## Recommended Next Steps

```
Phase 3, Step 3.1 — GIS Clustering (3 days)
Phase 3, Step 3.2 — GIS Heatmap (1 day)
Phase 3, Step 3.3 — GIS Timeline (1 day)
Phase 3, Step 3.4 — Field PWA Offline Sync (3 days)
```

Then jump to Phase 6 (Admin UI) in parallel with Phase 4 (Reporting).

---

## Dependency Map

```
MFA ──────────────────────────────► Portal Security Settings    ✅
LDAP ────────────────────────────► Auth middleware              🔲
Web Push ────────────────────────► Notification settings page   ✅
Telegram ────────────────────────► Notification settings page   ✅
ClickHouse ──────────────────────► Analytics queries            🔲
                                 └─► Airflow feature sync       🔲
Airflow feature sync ────────────► ML model training            🔲
ML model training ───────────────► Risk predictions API         🔲
Risk predictions API ────────────► Map client risk overlay      🔲
GIS clustering ─────────────────► Map client cluster layer      🔲
Reporting engine ────────────────► Analytics queries + Files    🔲
Field PWA offline ───────────────► GIS incident endpoint ✅     🔲
```

---

*Last updated: 2026-04-08*
