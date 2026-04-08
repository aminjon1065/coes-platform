# CoESCD Platform — Detailed Implementation Plan

> Generated: 2026-04-08
> Platform: CoESCD Unified Digital Platform (Tajikistan Emergency Management)
> Stack: NestJS monorepo · PostgreSQL/PostGIS · Next.js 15 · Mediasoup · MapLibre

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
| LDAP / SAML SSO | ⚠️ Stub only |
| MFA (TOTP) | ❌ Missing |
| Web Push notifications | ⚠️ Incomplete |
| SMS notifications | ⚠️ Incomplete |
| Telegram notifications | ⚠️ Incomplete |
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
Phase 1 — Auth & Security Hardening       Weeks 1–3
Phase 2 — Notifications & Push            Weeks 4–5
Phase 3 — GIS Advanced + Field PWA        Weeks 6–8
Phase 4 — Analytics + Reporting           Weeks 9–11
Phase 5 — ML + Airflow Pipelines          Weeks 12–15
Phase 6 — Admin UI + Search Hardening     Weeks 16–17
Phase 7 — Production Hardening & Testing  Weeks 18–20
```

---

## PHASE 1 — Auth & Security Hardening

### Step 1.1 — MFA / TOTP

**Goal:** Users can enable time-based one-time passwords as a second factor.

**Files to create:**
```
apps/backend/src/modules/iam/
  entities/mfa-credentials.entity.ts
  dto/mfa.dto.ts
  services/mfa.service.ts
  controllers/mfa.controller.ts
apps/backend/src/infra/database/migrations/
  1712300020000-MfaSchema.ts
apps/portal-web/src/app/(secure)/settings/security/
  page.tsx
apps/portal-web/src/app/api/auth/
  mfa/setup/route.ts
  mfa/verify/route.ts
apps/portal-web/src/app/(public)/
  verify-mfa/page.tsx
```

**Implementation steps:**

1. Migration `1712300020000-MfaSchema.ts`:
   ```sql
   CREATE TABLE iam.mfa_credentials (
     id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
     user_id     UUID NOT NULL REFERENCES iam.user_credentials(id) ON DELETE CASCADE,
     secret      TEXT NOT NULL,
     enabled     BOOLEAN NOT NULL DEFAULT FALSE,
     verified_at TIMESTAMPTZ,
     backup_codes JSONB NOT NULL DEFAULT '[]',
     created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     UNIQUE(user_id)
   );
   ```

2. Install dependency:
   ```bash
   npm install otplib qrcode -w @coescd/backend
   npm install @types/qrcode -D -w @coescd/backend
   ```

3. `MfaService`:
   - `generateSecret(userId)` → `authenticator.generateSecret()` + QR code data URI
   - `enableMfa(userId, token)` → verify token, set `enabled=true`, `verified_at=NOW()`
   - `verify(userId, token)` → `authenticator.check(token, secret)`
   - `generateBackupCodes(userId)` → 10 random 8-char codes stored as bcrypt hashes
   - `verifyBackupCode(userId, code)` → find matching hash, mark used, return result

4. `MfaController` endpoints:
   - `POST /api/iam/mfa/setup` → returns `{ secret, qrCodeDataUri }`
   - `POST /api/iam/mfa/enable` → body `{ token }` → activates MFA
   - `POST /api/iam/mfa/disable` → body `{ token }` → deactivates
   - `POST /api/iam/mfa/verify` → body `{ token }` → issues `mfa_verified` JWT claim
   - `GET  /api/iam/mfa/backup-codes` → returns new set of backup codes

5. JWT changes:
   - Add claim `mfa_required: boolean` on login
   - Add claim `mfa_verified: boolean` after MFA step
   - Middleware: if `mfa_required && !mfa_verified` → return 403, redirect to `/verify-mfa`

6. Portal-Web `/settings/security`:
   - Show current MFA status
   - "Enable MFA" → fetch setup → display QR + manual key
   - Input field for confirmation code → POST enable
   - Show backup codes page after activation
   - "Disable MFA" button with confirmation

7. Portal-Web `/verify-mfa`:
   - 6-digit input (auto-submit on 6th digit)
   - "Use backup code" toggle
   - On success → redirect to original destination

---

### Step 1.2 — LDAP Integration

**Goal:** Users can authenticate against a corporate LDAP/Active Directory server.

**Files to create/modify:**
```
apps/backend/src/infra/config/ldap.config.ts              ← New
apps/backend/src/modules/iam/services/ldap.service.ts     ← Complete stub
apps/backend/src/modules/iam/controllers/auth.controller.ts ← Add LDAP route
apps/backend/src/infra/config/config.validation.ts        ← Add LDAP vars
.env.example                                              ← Add LDAP vars
```

**Implementation steps:**

1. Install dependency:
   ```bash
   npm install ldapts -w @coescd/backend
   ```

2. `ldap.config.ts`:
   ```typescript
   export default registerAs('ldap', () => ({
     url: process.env.LDAP_URL,
     baseDn: process.env.LDAP_BASE_DN,
     bindDn: process.env.LDAP_BIND_DN,
     bindPassword: process.env.LDAP_BIND_PASSWORD,
     userFilter: process.env.LDAP_USER_FILTER ?? '(sAMAccountName={{username}})',
     userAttributes: ['cn', 'mail', 'department', 'telephoneNumber', 'thumbnailPhoto'],
   }));
   ```

3. `LdapService`:
   - `authenticate(username, password)` → bind with user DN, return user attributes
   - `syncUser(attributes)` → upsert into `users.user_profiles`, set `iam.user_credentials.auth_provider = 'ldap'`
   - `searchUser(username)` → admin bind, search by filter

4. `AuthController` new route `POST /api/auth/ldap/login`:
   - Validate credentials via LDAP
   - Sync user profile
   - Issue JWT (same flow as local login)
   - Emit audit event `iam.ldap_login`

5. Add env vars to `.env.example`:
   ```
   AUTH_PROVIDER=local           # local | ldap | saml
   LDAP_URL=ldap://dc.example.com:389
   LDAP_BASE_DN=dc=example,dc=com
   LDAP_BIND_DN=cn=readonly,dc=example,dc=com
   LDAP_BIND_PASSWORD=secret
   LDAP_USER_FILTER=(sAMAccountName={{username}})
   ```

---

### Step 1.3 — SAML / SSO Integration

**Goal:** Support SAML 2.0 identity providers (e.g., government IdP, Active Directory FS).

**Files to create/modify:**
```
apps/backend/src/infra/config/saml.config.ts
apps/backend/src/modules/iam/services/saml.service.ts    ← Complete stub
apps/backend/src/modules/iam/controllers/sso.controller.ts ← Complete stub
```

**Implementation steps:**

1. Install dependency:
   ```bash
   npm install @node-saml/node-saml -w @coescd/backend
   ```

2. `SamlService`:
   - `getMetadata()` → returns SP metadata XML (for IdP registration)
   - `createLoginUrl()` → generates AuthnRequest redirect URL
   - `validateCallback(body)` → parses SAMLResponse, extracts `nameID` + attributes
   - `mapAttributes(samlAttrs)` → maps IdP attributes to user profile fields

3. `SsoController`:
   - `GET  /api/auth/saml/metadata` → returns SP metadata XML (no auth required)
   - `GET  /api/auth/saml/login` → redirect to IdP
   - `POST /api/auth/saml/callback` → validate assertion → upsert user → issue JWT → redirect to dashboard

4. Add env vars:
   ```
   SAML_ENTRY_POINT=https://idp.example.gov.tj/saml/login
   SAML_ISSUER=https://coescd.gov.tj
   SAML_CERT=<base64 IdP signing certificate>
   SAML_PRIVATE_KEY=<base64 SP private key>
   SAML_CALLBACK_URL=https://coescd.gov.tj/api/auth/saml/callback
   ```

---

## PHASE 2 — Notifications & Push

### Step 2.1 — Web Push Notifications

**Goal:** Browser push notifications for alerts even when portal tab is closed.

**Files to create/modify:**
```
apps/backend/src/modules/notifications/services/webpush.service.ts ← Complete
apps/backend/src/modules/notifications/services/notification.service.ts ← Add dispatch case
apps/backend/src/modules/notifications/controllers/notification.controller.ts ← Add subscribe endpoint
apps/portal-web/src/
  lib/push.ts                        ← New
  app/(secure)/settings/notifications/page.tsx ← Add toggle
  public/sw.js                       ← New (or update existing)
```

**Implementation steps:**

1. Install dependency:
   ```bash
   npm install web-push -w @coescd/backend
   npm install @types/web-push -D -w @coescd/backend
   ```

2. `WebPushService`:
   ```typescript
   async send(subscription: PushSubscriptionEntity, payload: NotificationPayload) {
     await webpush.sendNotification(
       { endpoint: subscription.endpoint, keys: subscription.keys },
       JSON.stringify({ title: payload.title, body: payload.body, url: payload.deepLink }),
       { vapidDetails: { subject, publicKey, privateKey } }
     );
   }
   ```

3. `NotificationController`:
   - `POST /api/notifications/subscribe/webpush` → body `{ endpoint, keys }` → save `push_subscriptions`
   - `DELETE /api/notifications/subscribe/webpush` → remove subscription

4. `NotificationService.dispatch()` add case:
   ```typescript
   case 'webpush':
     const subs = await this.pushSubRepo.find({ where: { userId } });
     await Promise.allSettled(subs.map(s => this.webPushService.send(s, payload)));
   ```

5. Portal-Web `lib/push.ts`:
   ```typescript
   export async function subscribeToWebPush(vapidPublicKey: string) {
     const reg = await navigator.serviceWorker.ready;
     const sub = await reg.pushManager.subscribe({
       userVisibleOnly: true,
       applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
     });
     await fetch('/api/notifications/subscribe/webpush', {
       method: 'POST', body: JSON.stringify(sub)
     });
   }
   ```

6. `public/sw.js` push handler:
   ```javascript
   self.addEventListener('push', event => {
     const data = event.data.json();
     event.waitUntil(
       self.registration.showNotification(data.title, {
         body: data.body, icon: '/icon-192.png', data: { url: data.url }
       })
     );
   });
   self.addEventListener('notificationclick', event => {
     event.notification.close();
     event.waitUntil(clients.openWindow(event.notification.data.url));
   });
   ```

---

### Step 2.2 — Telegram Notifications

**Goal:** Deliver critical alerts via Telegram bot.

**Files to create/modify:**
```
apps/backend/src/modules/notifications/services/telegram.service.ts  ← Complete
apps/backend/src/modules/notifications/controllers/notification.controller.ts ← Add webhook
apps/portal-web/src/app/(secure)/settings/notifications/page.tsx ← Telegram link flow
```

**Implementation steps:**

1. `TelegramService`:
   - `sendMessage(chatId, text)` → `POST https://api.telegram.org/bot{TOKEN}/sendMessage`
   - `setWebhook(url)` → register webhook on startup
   - `handleWebhookUpdate(update)` → extract `/start TOKEN` command → link account

2. Linking flow:
   - User clicks "Connect Telegram" in settings
   - Backend generates short-lived token, returns deep link: `https://t.me/BOTNAME?start=TOKEN`
   - Bot receives `/start TOKEN` → validate token → store `chat_id` in `telegram_subscriptions`
   - UI polls or uses SSE to detect successful linking

3. `NotificationController`:
   - `POST /api/webhooks/telegram` → no auth (verified by Telegram secret header) → `handleWebhookUpdate`
   - `GET  /api/notifications/subscribe/telegram/link` → returns `{ deepLink, token }`
   - `DELETE /api/notifications/subscribe/telegram` → removes subscription

4. Add env vars:
   ```
   TELEGRAM_BOT_TOKEN=123456:ABCdef...
   TELEGRAM_WEBHOOK_SECRET=random-secret-string
   ```

---

### Step 2.3 — SMS Notifications

**Goal:** Deliver critical alerts via SMS for users without internet access.

**Files to create:**
```
apps/backend/src/modules/notifications/services/sms.service.ts
apps/backend/src/modules/notifications/providers/
  sms-provider.interface.ts
  eskiz-sms.provider.ts        ← Tajikistan/Uzbekistan region
  twilio-sms.provider.ts       ← Fallback/international
apps/backend/src/infra/config/sms.config.ts
```

**Implementation steps:**

1. `SmsProvider` interface:
   ```typescript
   interface SmsProvider {
     send(to: string, message: string): Promise<{ messageId: string }>;
   }
   ```

2. `EskizSmsProvider`:
   - Auth: `POST https://notify.eskiz.uz/api/auth/login` → get token
   - Send: `POST https://notify.eskiz.uz/api/message/sms/send`
   - Token refresh: cache token, re-auth on 401

3. `SmsService`:
   - Factory: select provider based on `SMS_PROVIDER` env var
   - `send(userId, message)` → look up user phone → call provider
   - Graceful skip if `SMS_ENABLED=false`

4. `NotificationService.dispatch()` add case for `'sms'`

5. Add env vars:
   ```
   SMS_ENABLED=false
   SMS_PROVIDER=eskiz           # eskiz | twilio
   SMS_ESKIZ_EMAIL=...
   SMS_ESKIZ_PASSWORD=...
   SMS_TWILIO_SID=...
   SMS_TWILIO_TOKEN=...
   SMS_FROM=CoESCD
   ```

---

## PHASE 3 — GIS Advanced + Field PWA

### Step 3.1 — GIS Clustering

**Goal:** Cluster incident markers at low zoom levels to avoid visual overload.

**Files to create/modify:**
```
apps/backend/src/modules/gis/
  services/gis-clustering.service.ts   ← New
  controllers/gis.controller.ts        ← Add /clusters endpoint
  dto/gis-query.dto.ts                 ← Add ClusterQueryDto
apps/map-client/src/
  components/Map/ClusterLayer.tsx      ← New
  api/gis.ts                          ← Add fetchClusters()
```

**Implementation steps:**

1. `GisClusteringService.getClusters(bbox, zoom, filters)`:
   ```sql
   SELECT
     ST_X(ST_Centroid(ST_Collect(location))) AS lng,
     ST_Y(ST_Centroid(ST_Collect(location))) AS lat,
     COUNT(*) AS count,
     array_agg(id) AS incident_ids
   FROM gis.incident_locations
   WHERE location && ST_MakeEnvelope($1,$2,$3,$4, 4326)
     AND status != 'resolved'
   GROUP BY ST_SnapToGrid(location, $5)  -- grid size based on zoom
   ```

2. Endpoint: `GET /api/gis/clusters?bbox=lng1,lat1,lng2,lat2&zoom=10`
   - Returns GeoJSON FeatureCollection
   - Each feature: `{ type: 'Feature', geometry: Point, properties: { count, incidentIds } }`

3. Map client `ClusterLayer.tsx`:
   - On map `moveend` → fetch clusters for current bounds + zoom
   - Render `CircleLayer` with radius scaled by `count`
   - Color: green (1–5) → yellow (6–20) → red (20+)
   - Click: if count=1 → open incident panel; if count>1 → zoom in to bbox of cluster

---

### Step 3.2 — GIS Heatmap

**Goal:** Visualize incident density across the map.

**Files to create:**
```
apps/backend/src/modules/gis/services/gis-heatmap.service.ts
apps/map-client/src/components/Map/HeatmapLayer.tsx
```

**Implementation steps:**

1. `GisHeatmapService.getHeatmapData(bbox, from, to)`:
   ```sql
   SELECT
     ST_X(location) AS lng,
     ST_Y(location) AS lat,
     COUNT(*) AS weight
   FROM gis.incident_locations
   WHERE location && ST_MakeEnvelope($1,$2,$3,$4, 4326)
     AND created_at BETWEEN $5 AND $6
   GROUP BY ST_SnapToGrid(location, 0.01)
   ```

2. Endpoint: `GET /api/gis/heatmap?bbox=...&from=ISO&to=ISO`

3. Map client `HeatmapLayer.tsx`:
   - MapLibre `HeatmapLayer` with `heatmap-weight` from `weight` property
   - Toggle button in map toolbar
   - Date range picker for historical view

---

### Step 3.3 — GIS Incident Timeline

**Goal:** Temporal filtering to see incidents over a time range.

**Files to create:**
```
apps/backend/src/modules/gis/services/gis-analytics.service.ts
apps/map-client/src/components/Map/TimelineSlider.tsx
```

**Implementation steps:**

1. `GisAnalyticsService.getTimeline(granularity)`:
   - `granularity`: `hour` | `day` | `week`
   - Returns: `[{ period, count, resolved, pending }]`

2. Endpoint: `GET /api/gis/analytics/timeline?granularity=day&from=...&to=...`

3. Map client `TimelineSlider.tsx`:
   - Range slider mapped to time periods
   - Dragging slider → refetch map data for that time window
   - Play button → animate through time periods

---

### Step 3.4 — Field PWA Offline Sync

**Goal:** Field personnel can submit incident reports without internet; sync when back online.

**Files to create/modify:**
```
apps/field-pwa/src/
  lib/
    idb.ts                     ← New: IndexedDB wrapper
    sync.ts                    ← New: sync queue manager
  pages/
    ReportIncidentPage.tsx     ← Complete offline-first submit
    TaskListPage.tsx           ← Add offline indicator
  components/
    SyncStatus.tsx             ← New
  sw.ts                        ← Complete background sync
```

**Implementation steps:**

1. `idb.ts` — open database `coescd-pwa`, version 1:
   - Store `tasks`: cache of assigned tasks (`keyPath: 'id'`)
   - Store `incidents_queue`: pending submissions (`keyPath: 'queueId'`, autoIncrement)
   - Store `sync_log`: history of sync operations

2. `sync.ts`:
   ```typescript
   export async function queueIncident(data: IncidentReport) {
     const db = await openIdb();
     await db.add('incidents_queue', { ...data, status: 'pending', queuedAt: Date.now() });
     // Register background sync if supported
     if ('serviceWorker' in navigator && 'SyncManager' in window) {
       const reg = await navigator.serviceWorker.ready;
       await reg.sync.register('incident-sync');
     }
   }

   export async function flushQueue() {
     const db = await openIdb();
     const pending = await db.getAll('incidents_queue');
     for (const item of pending.filter(i => i.status === 'pending')) {
       try {
         await fetch('/api/gis/incidents/report', { method: 'POST', body: JSON.stringify(item) });
         await db.put('incidents_queue', { ...item, status: 'synced', syncedAt: Date.now() });
       } catch {
         // leave as pending
       }
     }
   }
   ```

3. `sw.ts` background sync:
   ```typescript
   self.addEventListener('sync', event => {
     if (event.tag === 'incident-sync') {
       event.waitUntil(flushQueue());
     }
   });
   self.addEventListener('online', () => flushQueue());
   ```

4. `ReportIncidentPage.tsx` submit handler:
   ```typescript
   async function onSubmit(data) {
     try {
       await fetch('/api/gis/incidents/report', { method: 'POST', body: JSON.stringify(data) });
       toast.success('Отчёт отправлен');
     } catch {
       await queueIncident(data);
       toast.info('Нет соединения. Отчёт сохранён локально');
     }
   }
   ```

5. `SyncStatus.tsx`:
   - Shows badge: `3 ожидают синхронизации`
   - Shows last sync timestamp
   - Manual "Sync Now" button

---

## PHASE 4 — Analytics + Reporting

### Step 4.1 — ClickHouse Integration

**Goal:** High-performance analytics queries on event data.

**Files to create:**
```
apps/backend/src/infra/clickhouse/
  clickhouse.module.ts
  clickhouse.service.ts
apps/backend/src/modules/analytics/
  services/
    analytics-writer.service.ts
    analytics-query.service.ts
  controllers/analytics.controller.ts   ← Complete
apps/portal-web/src/app/(secure)/analytics/
  page.tsx                              ← Add charts
```

**ClickHouse tables (create via migration script):**
```sql
CREATE TABLE coescd_ml.events (
  event_type   LowCardinality(String),
  entity_type  LowCardinality(String),
  entity_id    UUID,
  actor_id     UUID,
  department_id UUID,
  metadata     String,           -- JSON blob
  occurred_at  DateTime64(3)
) ENGINE = MergeTree()
ORDER BY (event_type, occurred_at);

CREATE TABLE coescd_ml.incident_features (
  incident_id  UUID,
  lat          Float64,
  lng          Float64,
  severity     UInt8,
  department_id UUID,
  hour_of_day  UInt8,
  day_of_week  UInt8,
  occurred_at  DateTime64(3)
) ENGINE = MergeTree()
ORDER BY occurred_at;
```

**Implementation steps:**

1. Install dependency:
   ```bash
   npm install @clickhouse/client -w @coescd/backend
   ```

2. `ClickhouseService`:
   - Wraps `@clickhouse/client` with config injection
   - Methods: `insert(table, rows)`, `query<T>(sql, params)`, `healthCheck()`

3. `AnalyticsWriterService`:
   - `@OnEvent('task.completed')` → insert event row
   - `@OnEvent('document.approved')` → insert event row
   - `@OnEvent('incident.reported')` → insert event row + feature row
   - Batch insert (flush every 100 events or 5 seconds)

4. `AnalyticsQueryService`:
   - `getIncidentTrends(from, to, granularity)`:
     ```sql
     SELECT toStartOfInterval(occurred_at, INTERVAL 1 DAY) AS period,
            COUNT(*) AS count
     FROM coescd_ml.events
     WHERE event_type = 'incident.reported'
       AND occurred_at BETWEEN {from} AND {to}
     GROUP BY period ORDER BY period
     ```
   - `getTaskCompletionRate(departmentId, period)` → ratio complete/total
   - `getDepartmentKPIs(departmentId)` → composite: incidents, tasks, docs metrics

5. New endpoints:
   - `GET /api/analytics/incidents/trends?from=&to=&granularity=day`
   - `GET /api/analytics/departments/:id/kpis`
   - `GET /api/analytics/tasks/completion-rate?department=&period=30d`

---

### Step 4.2 — Reporting Engine

**Goal:** Define report templates, schedule automatic generation, export as PDF/XLSX.

**Files to create/modify:**
```
apps/backend/src/modules/reporting/
  services/
    report-executor.service.ts    ← Complete
    report-scheduler.service.ts   ← New
    report-renderer.service.ts    ← New
  dto/report.dto.ts               ← Extend
apps/portal-web/src/app/(secure)/reporting/
  page.tsx                        ← Complete
  [id]/page.tsx                   ← Complete
```

**Report definition schema (already in DB):**
```typescript
// report_definitions table already has: name, query_template, parameters, output_format, schedule
```

**Implementation steps:**

1. Install dependencies:
   ```bash
   npm install exceljs pdfkit -w @coescd/backend
   npm install @types/pdfkit -D -w @coescd/backend
   ```

2. `ReportSchedulerService`:
   - On app startup: load all `report_definitions` with non-null `schedule`
   - Dynamically register `@Cron()` jobs for each definition
   - On trigger: call `ReportExecutorService.execute(definitionId)`

3. `ReportExecutorService.execute(definitionId)`:
   ```typescript
   async execute(definitionId: string, triggeredBy?: string) {
     const def = await this.defRepo.findOneOrFail(definitionId);
     const execution = await this.execRepo.save({ definitionId, status: 'running', startedAt: new Date() });
     try {
       const rows = await this.dataSource.query(def.queryTemplate, def.parameters);
       const fileBuffer = await this.renderer.render(rows, def.outputFormat, def.name);
       const fileRecord = await this.filesService.storeBuffer(fileBuffer, `${def.name}.${def.outputFormat}`);
       await this.execRepo.update(execution.id, {
         status: 'completed', fileId: fileRecord.id, completedAt: new Date(), rowCount: rows.length
       });
       await this.notificationService.notifyUser(triggeredBy ?? def.ownerPositionId, {
         title: `Report ready: ${def.name}`, deepLink: `/reporting/${execution.id}`
       });
     } catch (err) {
       await this.execRepo.update(execution.id, { status: 'failed', error: err.message });
     }
   }
   ```

4. `ReportRendererService`:
   - `renderXlsx(rows, name)` → uses `exceljs`, styles header row, auto-width columns
   - `renderPdf(rows, name)` → uses `pdfkit`, table layout with department branding
   - `renderCsv(rows)` → simple CSV serialization

5. Portal-Web reporting page:
   - Table of report definitions with last-run status
   - "Run Now" button → POST `/api/reporting/:id/execute`
   - History table with download links
   - Schedule display (cron expression → human-readable)

---

## PHASE 5 — ML + Airflow Pipelines

### Step 5.1 — MLflow Integration

**Goal:** Serve ML model predictions for risk assessment.

**Files to create/modify:**
```
apps/backend/src/modules/ml/
  services/
    mlflow.service.ts                ← New
    risk-prediction.service.ts       ← Complete
    feature-engineering.service.ts   ← New
  controllers/ml.controller.ts       ← Complete
apps/map-client/src/components/ML/
  RiskOverlay.tsx                    ← Complete
```

**Implementation steps:**

1. `MlflowService` (HTTP client to MLflow REST API):
   ```typescript
   async getProductionModel(name: string) {
     const res = await fetch(`${MLFLOW_URL}/api/2.0/mlflow/registered-models/get-latest-versions`, {
       method: 'POST', body: JSON.stringify({ name, stages: ['Production'] })
     });
     return res.json();
   }
   async predict(modelName: string, features: Record<string, unknown>[]) {
     // MLflow model server: POST /invocations
     const res = await fetch(`${MLFLOW_MODEL_SERVER_URL}/invocations`, {
       method: 'POST',
       headers: { 'Content-Type': 'application/json' },
       body: JSON.stringify({ dataframe_records: features })
     });
     return res.json();
   }
   ```

2. `FeatureEngineeringService.buildFeatures(departmentId, windowHours)`:
   - Query recent incidents, tasks, weather data
   - Compute: `incident_rate_24h`, `unresolved_ratio`, `task_overdue_count`, `hour_of_day`
   - Return normalized feature vector

3. `RiskPredictionService`:
   - Scheduled job `@Cron('0 * * * *')` → predict risk for each department
   - Store in `ml.risk_predictions` table
   - Emit event `ml.risk_updated` → WebSocket push to map clients

4. Endpoints:
   - `GET /api/ml/risk/departments` → current risk scores per department
   - `GET /api/ml/risk/map` → GeoJSON with risk scores per admin area
   - `GET /api/ml/models` → list registered models and versions
   - `GET /api/ml/models/:name/performance` → accuracy metrics from `model_performance_snapshots`

5. Map client `RiskOverlay.tsx`:
   - Choropleth layer: admin areas colored by risk score (green → yellow → red)
   - Legend with score ranges
   - Tooltip on hover: department name + risk score + last updated
   - Toggle button in map toolbar

---

### Step 5.2 — Airflow DAGs

**Goal:** Automate data sync, model training, report generation, and maintenance.

**Files to create:**
```
apps/pipelines/dags/
  sync_incident_features.py
  train_risk_model.py
  export_daily_analytics.py
  archive_audit_events.py
  cleanup_old_files.py
apps/pipelines/plugins/
  coescd_hooks.py
  coescd_operators.py
```

**DAG inventory:**

| DAG ID | Schedule | SLA | Purpose |
|--------|----------|-----|---------|
| `sync_incident_features` | `*/15 * * * *` | 5 min | PG → ClickHouse feature sync |
| `train_risk_model` | `0 2 * * *` | 2 hr | Nightly model retraining |
| `export_daily_analytics` | `0 6 * * *` | 30 min | Daily KPI report generation |
| `archive_audit_events` | `0 3 * * 0` | 4 hr | Weekly audit archival |
| `cleanup_old_files` | `0 4 * * *` | 1 hr | Orphan file cleanup in MinIO |

**`sync_incident_features.py`:**
```python
from airflow import DAG
from airflow.providers.postgres.hooks.postgres import PostgresHook
from airflow.operators.python import PythonOperator
from clickhouse_driver import Client
from datetime import datetime, timedelta

def sync_features(**context):
    pg = PostgresHook(postgres_conn_id='COESCD_POSTGRES')
    rows = pg.get_records("""
        SELECT id, ST_X(location), ST_Y(location), severity, department_id,
               EXTRACT(HOUR FROM created_at), EXTRACT(DOW FROM created_at), created_at
        FROM gis.incident_locations
        WHERE created_at > NOW() - INTERVAL '20 minutes'
    """)
    ch = Client(host='clickhouse', user='coescd', password=CH_PASSWORD, database='coescd_ml')
    ch.execute('INSERT INTO incident_features VALUES', rows)

with DAG('sync_incident_features', schedule_interval='*/15 * * * *',
         start_date=datetime(2026, 1, 1), catchup=False) as dag:
    PythonOperator(task_id='sync', python_callable=sync_features)
```

**`train_risk_model.py`:**
```python
def train(**context):
    # 1. Fetch training data from ClickHouse (last 90 days)
    # 2. Feature engineering: rolling aggregates
    # 3. Train GradientBoostingClassifier
    # 4. Evaluate: accuracy, precision, recall on hold-out set
    # 5. If accuracy > 0.75: log to MLflow, promote to Production
    # 6. POST /api/ml/models/{name}/performance → store snapshot
    pass

def check_performance(**context):
    # If accuracy < 0.70: send alert notification via backend API
    pass
```

**`archive_audit_events.py`:**
```python
from airflow.providers.postgres.operators.postgres import PostgresOperator

archive = PostgresOperator(
    task_id='archive_old_events',
    postgres_conn_id='COESCD_POSTGRES',
    sql="""
        INSERT INTO audit.audit_archive
        SELECT * FROM audit.audit_events
        WHERE created_at < NOW() - INTERVAL '90 days';

        DELETE FROM audit.audit_events
        WHERE created_at < NOW() - INTERVAL '90 days';
    """
)
```

---

## PHASE 6 — Admin UI + Search Hardening

### Step 6.1 — Admin Users Page

**File:** `apps/portal-web/src/app/(secure)/admin/users/page.tsx`

**Features to implement:**
1. Data table: name, email, department, positions, roles, status, last login
2. Filters: department, status (active/locked/suspended), role
3. Search: by name or email
4. Pagination: server-side (page, limit params)
5. Actions:
   - "Create User" → modal: username, email, display name, initial department, position, role
   - "Edit" → modal: same fields
   - "Assign Role" → inline role picker with expiry date
   - "Assign Position" → position picker from department tree
   - "Lock / Unlock" → toggle status
   - "Offboard" → confirmation dialog → `POST /api/admin/users/:id/offboard`
6. Access guard: `useRequireCapability('admin.users.manage')`

---

### Step 6.2 — Admin Departments Page

**File:** `apps/portal-web/src/app/(secure)/admin/departments/page.tsx`

**Features to implement:**
1. Collapsible tree view (root → divisions → departments → units)
2. Inline "Add child" button on each node
3. Edit node: name (ru/en/tj), code, parent change
4. Delete with cascade warning (shows count of positions, users affected)
5. Drag-and-drop reordering (update `parent_id`)

---

### Step 6.3 — Admin Roles Page

**File:** `apps/portal-web/src/app/(secure)/admin/roles/page.tsx`

**Features to implement:**
1. List of roles with user count
2. Create/edit role: name, description, system flag
3. Capability matrix: checkboxes grouped by domain (edms, tasks, files, gis, admin, etc.)
4. Preview: "Users with this role" list

---

### Step 6.4 — System Health Page

**File:** `apps/portal-web/src/app/(secure)/admin/system/page.tsx`

**Features to implement:**
1. Service status cards: PostgreSQL, Redis, RabbitMQ, MinIO, OpenSearch, Gateway, Media
2. Each card: status badge (healthy/degraded/down) + response time + last checked
3. Storage usage bars: MinIO buckets, PostgreSQL table sizes
4. Active connections: WebSocket session count from gateway
5. Recent errors: last 20 error-level log entries
6. Actions: "Trigger reindex" → `POST /api/admin/search/reindex`
7. Auto-refresh every 30 seconds

---

### Step 6.5 — Search Hardening

**Files to modify:**
```
apps/backend/src/modules/search/services/search.service.ts
apps/portal-web/src/app/(secure)/search/page.tsx
```

**Implementation steps:**

1. OpenSearch index settings: add `icu_tokenizer` for multilingual support (Tajik/Russian/English)

2. Query enhancements:
   ```typescript
   // Add highlighting
   highlight: {
     fields: { title: {}, content: {}, body: {} },
     pre_tags: ['<mark>'], post_tags: ['</mark>']
   },
   // Add facet aggregations
   aggs: {
     by_type: { terms: { field: 'type' } },
     by_department: { terms: { field: 'departmentId' } },
     by_date: { date_histogram: { field: 'createdAt', calendar_interval: 'month' } }
   }
   ```

3. Incremental indexing: each domain service emits `search.index` event on create/update/delete → `SearchIndexingListener` handles upsert/delete in OpenSearch

4. Search portal-web page:
   - Left sidebar: facet checkboxes (type, department, date range)
   - Result item: highlighted snippet below title
   - Type icon per result (document, task, file, incident)
   - Keyboard shortcut `Ctrl+K` → opens search modal from any page

---

## PHASE 7 — Production Hardening & Testing

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

**Pattern for each E2E test:**
```typescript
describe('EDMS Workflow (e2e)', () => {
  let app: INestApplication;
  let adminToken: string;

  beforeAll(async () => {
    // Start test app with real PostgreSQL (testcontainers or local test DB)
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    // Seed: admin user, department, role
    adminToken = await loginAs('admin', 'test-password');
  });

  it('full document approval cycle', async () => {
    // 1. Create document
    const { id } = await post('/api/edms/documents', documentPayload, adminToken);
    // 2. Start workflow
    await post(`/api/edms/documents/${id}/workflow/start`, {}, adminToken);
    // 3. Approve at each step
    // 4. Assert final status = 'approved'
    const doc = await get(`/api/edms/documents/${id}`, adminToken);
    expect(doc.status).toBe('approved');
    // 5. Assert audit event created
  });
});
```

---

### Step 7.2 — Rate Limiting & Security Headers

**Files to modify:**
```
apps/backend/src/main.ts
apps/backend/src/app.module.ts
infra/docker/nginx/conf.d/api.conf
```

**Implementation steps:**

1. Install:
   ```bash
   npm install @nestjs/throttler -w @coescd/backend
   ```

2. `AppModule` add:
   ```typescript
   ThrottlerModule.forRoot([
     { name: 'auth', ttl: 60000, limit: 5 },    // 5 login attempts/min
     { name: 'api', ttl: 60000, limit: 300 },   // 300 req/min general
   ])
   ```

3. Apply `@Throttle({ auth: { limit: 5, ttl: 60000 } })` on `AuthController`

4. Nginx security headers:
   ```nginx
   add_header X-Frame-Options "SAMEORIGIN" always;
   add_header X-Content-Type-Options "nosniff" always;
   add_header Referrer-Policy "strict-origin-when-cross-origin" always;
   add_header Content-Security-Policy "default-src 'self'; ..." always;
   add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
   ```

---

### Step 7.3 — Alerting Rules (Prometheus)

**File:** `infra/docker/prometheus/rules/coescd.rules.yml`

```yaml
groups:
  - name: coescd-backend
    rules:
      - alert: HighErrorRate
        expr: rate(http_requests_total{status=~"5.."}[5m]) / rate(http_requests_total[5m]) > 0.01
        for: 5m
        annotations:
          summary: "Backend error rate > 1%"

      - alert: HighLatency
        expr: histogram_quantile(0.99, rate(http_request_duration_seconds_bucket[5m])) > 2
        for: 5m
        annotations:
          summary: "p99 latency > 2 seconds"

  - name: coescd-database
    rules:
      - alert: PostgresConnectionPoolHigh
        expr: pg_stat_activity_count / pg_settings_max_connections > 0.8
        for: 2m
        annotations:
          summary: "PostgreSQL connection pool > 80%"

  - name: coescd-infrastructure
    rules:
      - alert: DiskSpaceLow
        expr: (node_filesystem_avail_bytes / node_filesystem_size_bytes) < 0.2
        for: 10m
        annotations:
          summary: "Disk space below 20% on {{ $labels.mountpoint }}"

      - alert: RedisMemoryHigh
        expr: redis_memory_used_bytes / redis_memory_max_bytes > 0.75
        for: 5m
        annotations:
          summary: "Redis memory usage > 75%"
```

---

## Implementation Priority Matrix

| Priority | Module | Effort | Business Impact |
|---|---|---|---|
| 🔴 P0 | MFA / TOTP | 3 days | Security compliance |
| 🔴 P0 | Web Push Notifications | 2 days | User engagement |
| 🔴 P0 | Admin UI (users/roles/depts) | 4 days | Day-to-day operations |
| 🟠 P1 | LDAP Integration | 3 days | Enterprise auth |
| 🟠 P1 | GIS Clustering + Heatmap | 3 days | Core field operations |
| 🟠 P1 | Field PWA Offline Sync | 3 days | Field personnel |
| 🟠 P1 | Reporting Engine | 5 days | Decision support |
| 🟡 P2 | ClickHouse Analytics | 5 days | Operational analytics |
| 🟡 P2 | Telegram Notifications | 2 days | Alert delivery |
| 🟡 P2 | Airflow DAGs | 4 days | Data automation |
| 🟡 P2 | Search Facets + Highlighting | 2 days | UX |
| 🟢 P3 | ML / MLflow / Risk Predictions | 8 days | Predictive capability |
| 🟢 P3 | SAML SSO | 3 days | Enterprise auth |
| 🟢 P3 | E2E Test Suite | 5 days | Quality assurance |
| 🟢 P3 | Prometheus Alerting | 1 day | Observability |

**Total estimated effort: ~57 developer-days**

---

## Recommended Start Sequence (Week 1)

```
Day 1-2:  MFA schema + backend service + MFA controller
Day 3:    Portal-Web MFA setup page + verify-mfa page
Day 4:    Web Push: complete webpush.service.ts + sw.js + subscribe endpoint
Day 5:    Admin Users page: data table + create/edit modal
Day 6-7:  Admin Departments tree + Roles capability matrix
```

---

## Dependency Map

```
MFA ──────────────────────────────► Portal Security Settings
LDAP ────────────────────────────► Auth middleware (parallel to MFA)
Web Push ────────────────────────► Notification settings page
Telegram ────────────────────────► Notification settings page
ClickHouse ──────────────────────► Analytics queries
                                 └─► Airflow feature sync (depends on CH)
Airflow feature sync ────────────► ML model training (depends on CH)
ML model training ───────────────► Risk predictions API
Risk predictions API ────────────► Map client risk overlay
GIS clustering ─────────────────► Map client cluster layer
Reporting engine ────────────────► Analytics queries (optional CH) + Files service
Field PWA offline ───────────────► GIS incident endpoint (already exists)
```

---

*Last updated: 2026-04-08*
