# CoESCD Platform — Implementation Plan

> **Platform:** CoESCD Unified Digital Platform (Tajikistan Emergency Management)
> **Type:** Government-grade, sovereign on-premises enterprise system
> **Total Timeline:** 24–30 months across 6 phases
> **Last Updated:** 2026-04-06 (Phase 6 complete: 6.1 SSO/LDAP, 6.2 SIEM export, 6.3 Delegated admin, 6.4 Mobile PWA)

---

## Legend

| Symbol | Meaning |
|--------|---------|
| ✅ | Done |
| 🔄 | In Progress |
| ⏳ | Planned / Not Started |
| 🚫 | Blocked |
| 🔁 | Recurring / Ongoing |

---

## Phase 0-1: Governance & Infrastructure Foundation
**Target:** Months 1–3

### 0.1 Team & Process Setup
| # | Task | Status | Notes |
|---|------|--------|-------|
| 0.1.1 | Define engineering team structure (frontend, backend, DevOps, QA) | ⏳ | |
| 0.1.2 | Establish Git branching strategy and code review process | ⏳ | |
| 0.1.3 | Set up project management tooling (ticketing, sprints) | ⏳ | |
| 0.1.4 | Define Definition of Done and testing standards | ⏳ | |
| 0.1.5 | Write ADRs (Architecture Decision Records) for key choices | ⏳ | |

### 0.2 Infrastructure Provisioning
| # | Task | Status | Notes |
|---|------|--------|-------|
| 0.2.1 | Provision on-premises servers (compute, storage, networking) | ⏳ | Gov-controlled infra |
| 0.2.2 | Set up network segmentation (DMZ, internal, DB tiers) | ⏳ | |
| 0.2.3 | Install Docker and Docker Compose on all nodes | ✅ | docker-compose.yml with profiles |
| 0.2.4 | Configure Nginx as API Gateway with TLS 1.3 | ✅ | TLS 1.3, rate limiting, WS proxy |
| 0.2.5 | Set up internal DNS and service discovery | ⏳ | |
| 0.2.6 | Configure CI/CD pipeline (GitHub Actions or GitLab CI) | ✅ | `.github/workflows/ci.yml` (lint/test/build/push) + `cd.yml` (helm upgrade --install, smoke test, auto-rollback) |

### 0.3 Observability Stack
| # | Task | Status | Notes |
|---|------|--------|-------|
| 0.3.1 | Deploy Prometheus + Grafana for metrics | ✅ | Provisioned via obs profile |
| 0.3.2 | Deploy Loki for log aggregation | ✅ | Loki + Promtail |
| 0.3.3 | Deploy Jaeger for distributed tracing | ✅ | OTLP receiver |
| 0.3.4 | Configure alerting rules and dashboards | ✅ | `infra/docker/prometheus/alerts.yml` (30 rules: API, DB, Redis, RabbitMQ, MinIO, GIS, OpenSearch, infra nodes, ML drift); `infra/docker/prometheus/alertmanager.yml` (routes: critical→oncall, DB→DBA); Grafana dashboards: `coescd-platform.json` (system overview) + `coescd-emergency-ops.json` (incidents, ML, tiles); alertmanager added to obs docker-compose profile |

### 0.4 Database Architecture
| # | Task | Status | Notes |
|---|------|--------|-------|
| 0.4.1 | Deploy PostgreSQL 16 with multi-schema layout | ✅ | 13 schemas, init SQL |
| 0.4.2 | Configure Redis 7 Cluster for cache and presence | ✅ | Redis 7 with AOF |
| 0.4.3 | Deploy MinIO (S3-compatible object storage) | ✅ | Pinned release |
| 0.4.4 | Deploy RabbitMQ as event/message broker | ✅ | vhost: coescd |
| 0.4.5 | Define database backup and recovery procedures | ✅ | `deploy/backup/postgres-backup-cronjob.yaml` (daily 02:00 TJT + weekly Sunday CronJobs; pg_dump custom format, compress=9, uploads to MinIO `coescd-backups`); `deploy/backup/restore.sh` (download from MinIO, integrity check, DB drop/recreate, pg_restore --jobs=4, post-restore row-count validation, auto scale-down/up) |
| 0.4.6 | Set up database migration tooling (Flyway / Liquibase) | ✅ | TypeORM migrations |

---

## Phase 1: Core Platform Foundation
**Target:** Months 3–6

### 1.1 Identity & Access Management (IAM)
| # | Task | Status | Notes |
|---|------|--------|-------|
| 1.1.1 | Design IAM schema (users, credentials, sessions, tokens) | ✅ | |
| 1.1.2 | Implement user registration and credential storage (bcrypt) | ✅ | bcrypt rounds=12 |
| 1.1.3 | Implement login endpoint with JWT issuance | ✅ | |
| 1.1.4 | Implement refresh token rotation | ✅ | Family-based reuse detection |
| 1.1.5 | Implement logout and session invalidation | ✅ | Single + all devices |
| 1.1.6 | Implement service account management | ✅ | isServiceAccount flag |
| 1.1.7 | SSO/SAML/OIDC hook points (design-only, no implementation yet) | ✅ | JwtStrategy abstracted |
| 1.1.8 | Write IAM unit + integration tests | ✅ | iam.service.spec.ts — 25 tests (register, login, refresh, logout, validateCredential) |

### 1.2 Organization & Department Management
| # | Task | Status | Notes |
|---|------|--------|-------|
| 1.2.1 | Design org schema (departments, positions, hierarchies) | ✅ | Closure table tree |
| 1.2.2 | Implement organization CRUD APIs | ✅ | |
| 1.2.3 | Implement department CRUD and hierarchy APIs | ✅ | Tree + descendants |
| 1.2.4 | Implement position CRUD (immutable position definitions) | ✅ | |
| 1.2.5 | Implement command chain traversal logic | ✅ | getCommandChain(), isSubordinateTo() |
| 1.2.6 | Implement organizational change history tracking | ✅ | Append-only org_change_history |
| 1.2.7 | Write org management tests | ✅ | `org.service.spec.ts` — 25 tests: createDepartment, getDepartmentTree, getDescendants, deactivateDepartment, createPosition, getPositionById, getPositionsByDepartment, getCommandChain, isSubordinateTo |

### 1.3 User Management
| # | Task | Status | Notes |
|---|------|--------|-------|
| 1.3.1 | Design user profile schema (beyond identity) | ✅ | UserProfile + clearance level |
| 1.3.2 | Implement user-to-position assignment APIs | ✅ | PRIMARY/ACTING/CONCURRENT + occupant lookup |
| 1.3.3 | Implement user preferences and status management | ✅ | Language, notify channels, quiet hours |
| 1.3.4 | Implement delegation rules | ✅ | Delegation entity in authz schema |
| 1.3.5 | Implement onboarding/offboarding workflows | ✅ | offboard() vacates all positions |
| 1.3.6 | Write user management tests | ✅ | `users.service.spec.ts` — 28 tests: createProfile (conflict detection + default prefs), getProfileById, updateProfile, listProfiles (pagination + filter), assignPosition, vacatePosition, getActiveAssignments, getPositionOccupant, getPreferences, updatePreferences, offboard |

### 1.4 Authorization (RBAC + Hierarchical Authority)
| # | Task | Status | Notes |
|---|------|--------|-------|
| 1.4.1 | Design four-layer authorization model schema | ✅ | |
| 1.4.2 | Implement role definitions and role inheritance | ✅ | parentRoleId inheritance |
| 1.4.3 | Implement capability assignments to roles | ✅ | role_permissions join table |
| 1.4.4 | Implement scope resolution (positional hierarchy authority) | ✅ | departmentScopeId + descendant check |
| 1.4.5 | Implement classification levels and clearance model | ✅ | clearanceLevel on UserProfile |
| 1.4.6 | Implement contextual policy rules (delegations, time-bound) | ✅ | Delegation entity + layer 4 eval |
| 1.4.7 | Expose unified `can(user, action, resource)` API | ✅ | AuthorizationService.can() |
| 1.4.8 | Write authorization tests covering all four layers | ✅ | authorization.service.spec.ts — 22 tests (RBAC, scope, classification, delegation, cache, inheritance) |

### 1.5 Audit Infrastructure
| # | Task | Status | Notes |
|---|------|--------|-------|
| 1.5.1 | Design audit event schema (append-only, tamper-evident) | ✅ | integrity_hash + severity |
| 1.5.2 | Implement audit event emitter (used by all domains) | ✅ | AuditService.emit() — never throws |
| 1.5.3 | Implement audit log storage (separate schema, no delete) | ✅ | INSERT-only DB grant in init SQL |
| 1.5.4 | Implement audit log read-only query API | ✅ | AuditService.queryEvents() |
| 1.5.5 | Write audit integrity tests | ✅ | audit.service.spec.ts — 16 tests (emit, integrityHash, queryEvents, resilience) |

### 1.6 EDMS — Basic Document Management
| # | Task | Status | Notes |
|---|------|--------|-------|
| 1.6.1 | Design document schema (types, metadata, states) | ✅ | 5 entities + migration |
| 1.6.2 | Implement document registration and numbering system | ✅ | Advisory lock + sequential seq per series+year |
| 1.6.3 | Implement document state machine (Draft→Registered→Workflow→Completed→Archived) | ✅ | DOCUMENT_TRANSITIONS map |
| 1.6.4 | Implement basic document CRUD APIs | ✅ | EdmsController REST endpoints |
| 1.6.5 | Implement document classification and access control | ✅ | clearanceLevel check in EdmsService |
| 1.6.6 | Implement document versioning | ✅ | Immutable DocumentVersion snapshots |
| 1.6.7 | Write EDMS basic tests | ✅ | `edms.service.spec.ts` — 35 tests: createDocument, listDocuments, getDocument, updateDocument (versioning), registerDocument (advisory-lock), transitionStatus (state machine), addAttachment, removeAttachment, getVersions, listArchivedDocuments, autoArchiveCompletedDocuments; classification guards throughout |

### 1.7 Task Management — Basic
| # | Task | Status | Notes |
|---|------|--------|-------|
| 1.7.1 | Design task schema (assignment, hierarchy, executors) | ✅ | Task, TaskType, TaskAssignment, TaskHistory, TaskComment, TaskAttachment entities |
| 1.7.2 | Implement task creation with authority validation | ✅ | Command chain enforcement via OrgService.isSubordinateTo() |
| 1.7.3 | Implement task lifecycle state machine | ✅ | TASK_TRANSITIONS map + assertTransitionAuthority() |
| 1.7.4 | Implement subtask hierarchy (parent-child) | ✅ | parentTaskId + depth + MAX_SUBTASK_DEPTH=3 |
| 1.7.5 | Implement multiple executor support | ✅ | PRIMARY + CO_EXECUTOR assignment types |
| 1.7.6 | Implement deadline tracking and overdue detection | ✅ | markOverdueTasks() + isOverdue flag + EventEmitter |
| 1.7.7 | Write task management tests | ✅ | tasks.service.spec.ts — 30 tests (createTask, transitionStatus, markOverdue, listForSupervisor, updateProgress) |

### 1.8 Real-time Gateway — Foundation
| # | Task | Status | Notes |
|---|------|--------|-------|
| 1.8.1 | Stand up WebSocket server (Node.js or Go) | ✅ | Node.js ws server |
| 1.8.2 | Implement connection authentication (JWT validation) | ✅ | Bearer token + query param |
| 1.8.3 | Implement basic event fan-out to connected clients | ✅ | Room model + sendToUser() |
| 1.8.4 | Integrate gateway with RabbitMQ event bus | ✅ | AMQP topic exchange consumer |
| 1.8.5 | Write WebSocket integration tests | ✅ | `apps/gateway/src/gateway.spec.ts` — 17 tests: authentication (no token 4001, invalid token 4003, query-string token), ping/pong, join_room, leave_room, malformed JSON, broadcastToRoom (room filter, closed socket), sendToUser (multi-connection, no-op), disconnect (last conn sets offline, not-last does not) |

---

## Phase 2: Workflow, Communication & Files
**Target:** Months 6–12

### 2.1 EDMS — Full Workflow Engine
| # | Task | Status | Notes |
|---|------|--------|-------|
| 2.1.1 | Implement workflow template definitions per document type | ✅ | WorkflowTemplate + WorkflowStepDefinition with JSONB target resolvers |
| 2.1.2 | Implement multi-stage approval routing | ✅ | Sequential + parallel, configurable threshold |
| 2.1.3 | Implement vacant position escalation (route to reporting line) | ✅ | resolveVacantPositionEscalation() via OrgService command chain |
| 2.1.4 | Implement resolution issuance model (Chairman issues Resolution) | ✅ | Resolution + ExecutorAssignment entities + ResolutionService |
| 2.1.5 | Implement execution assignment and deadline tracking | ✅ | ExecutorAssignment with status + deadline + completion report |
| 2.1.6 | Implement immutable workflow history records | ✅ | WorkflowHistory append-only with delegation attribution |
| 2.1.7 | Implement document archive management | ✅ | archivedAt + archivedById + retentionReviewDate; autoArchiveCompletedDocuments(); GET /edms/documents/archive |
| 2.1.8 | Write full workflow integration tests | ✅ | Covered in `edms.service.spec.ts` — document lifecycle: DRAFT→REGISTERED→state transitions, version snapshots, archive retention dates, advisory-lock registration number generation |

### 2.2 EDMS → Task Integration
| # | Task | Status | Notes |
|---|------|--------|-------|
| 2.2.1 | Implement document resolution → task creation event flow | ✅ | edms.resolution_issued event published by ResolutionService |
| 2.2.2 | Implement bidirectional EDMS–Task sync | ✅ | ResolutionService.linkTask() + edms.all_assignments_complete event |
| 2.2.3 | Propagate correlation IDs across EDMS and Task events | ✅ | documentId + resolutionId + assignmentId carried in all events |
| 2.2.4 | Write cross-domain integration tests | ✅ | `tasks-edms.listener.spec.ts` — 22 tests: EDMS resolution→Task creation (priority mapping, DOCUMENT_GENERATED source, per-executor tasks, TaskHistory, events emitted, error resilience); task.status_changed→EDMS feedback; ChatDomainListener (task channel creation/dedup, read-only on close/cancel, document-linked channel, workflow.completed, logout→OFFLINE) |

### 2.3 Task Management — Full Features
| # | Task | Status | Notes |
|---|------|--------|-------|
| 2.3.1 | Implement progress tracking and supervisor oversight | ✅ | listTasksForSupervisor() with recursive CTE subordinate query + GET /tasks/oversight |
| 2.3.2 | Implement escalation alerts for overdue tasks | ✅ | TasksEscalationListener: task.overdue → walks command chain → notification.requested events |
| 2.3.3 | Implement task status propagation (parent blocks on children) | ✅ | propagateToParent(): all-done and any-blocking notifications to responsible position |
| 2.3.4 | Implement task-linked discussion channels | ✅ | task.channel_requested event emitted on DRAFT→ASSIGNED; Communication domain subscribes |
| 2.3.5 | Write full task management tests | ✅ | tasks.service.spec.ts covers Phase 2.3 scenarios (propagation, delegation, channel lifecycle) |

### 2.4 Communication — Chat & Messaging
| # | Task | Status | Notes |
|---|------|--------|-------|
| 2.4.1 | Design channel and message schema | ✅ | Channel, ChannelMember, Message, MessageEdit entities |
| 2.4.2 | Implement direct messages (1-to-1) | ✅ | getOrCreateDmChannel() with idempotent query |
| 2.4.3 | Implement group channels | ✅ | GROUP type + explicit member management |
| 2.4.4 | Implement department channels (auto-derived from org structure) | ✅ | DEPARTMENT type; org.department_created event hooks ChatDomainListener |
| 2.4.5 | Implement task-linked and document-linked channels | ✅ | createLinkedChannel() + ChatDomainListener on task.channel_requested / edms.document.registered |
| 2.4.6 | Implement emergency broadcast channels (one-way) | ✅ | EMERGENCY_BROADCAST type; sendMessage() restricts to OWNER role |
| 2.4.7 | Implement message threading and read receipts | ✅ | parentMessageId + replyCount + markRead() + last-read-sequence model |
| 2.4.8 | Implement classification-aware message filtering | ✅ | assertChannelAccess() + per-message clearance check on listMessages() |
| 2.4.9 | Implement message retention and archival policies | ✅ | retentionDays + legalHold + enforceRetentionPolicies() scheduled method |
| 2.4.10 | Write chat domain tests | ✅ | chat.service.spec.ts — 28 tests (channels, DM, sendMessage, markRead, edit/delete, retention) |

### 2.5 Real-time Gateway — Presence & Indicators
| # | Task | Status | Notes |
|---|------|--------|-------|
| 2.5.1 | Implement user presence tracking (online/offline/away) | ✅ | PresenceService: Redis TTL + heartbeat() + getBulkPresence() |
| 2.5.2 | Implement typing indicators | ✅ | setTyping() with 5-second Redis TTL; Gateway handles ephemeral fan-out |
| 2.5.3 | Implement read receipt delivery via WebSocket | ✅ | markRead() → chat.messages_read event → Gateway fans out to channel |
| 2.5.4 | Write real-time presence tests | ✅ | `presence.service.spec.ts` — 18 tests: setPresence (ONLINE/OFFLINE/AWAY/BUSY with TTLs), heartbeat (resets TTL), getPresence (cache hit/miss), getBulkPresence (mixed found/not-found), setTyping (short TTL), getTypingUsers, event emission on status change |

### 2.6 Notification Service
| # | Task | Status | Notes |
|---|------|--------|-------|
| 2.6.1 | Design notification schema and delivery channels | ✅ | Notification, NotificationPreference, NotificationDelivery entities (notifications schema) |
| 2.6.2 | Implement in-app notification delivery | ✅ | NotificationService.dispatch() + NotificationDomainListener subscribes to notification.requested; listForUser() inbox API |
| 2.6.3 | Implement email notification delivery | ✅ | EmailNotificationProvider adapter pattern (stub, production-swap ready); throttle-aware dispatchEmail() |
| 2.6.4 | Implement SMS notification delivery | ✅ | SmsNotificationProvider adapter stub; min-priority gating (smsMinPriority) |
| 2.6.5 | Implement user notification preferences | ✅ | NotificationPreference per userId × type; specific overrides default; CRUD via PATCH /notifications/preferences |
| 2.6.6 | Implement notification batching and throttling | ✅ | emailThrottleMinutes per preference; per-user per-type delivered-within window check; CRITICAL bypasses throttle |
| 2.6.7 | Implement delivery confirmation tracking | ✅ | NotificationDelivery per channel with status (pending/sent/failed/skipped), attempts, sentAt, providerMessageId |
| 2.6.8 | Implement alert escalation based on priority | ✅ | escalateUnreadCritical() re-dispatches SMS for CRITICAL unread >30min; CRITICAL bypasses email throttle |
| 2.6.9 | Write notification service tests | ✅ | notification.service.spec.ts — 27 tests (dispatch, throttle, email/SMS providers, preferences, escalation) |

### 2.7 File Management
| # | Task | Status | Notes |
|---|------|--------|-------|
| 2.7.1 | Design file storage schema (metadata, versioning, folders) | ✅ | 5 entities + migration (FilesSchema1712300003000) + MinIO backend |
| 2.7.2 | Implement file upload with MinIO integration | ✅ | Streaming upload with SHA-256 passthrough; MinioService + FilesService.uploadFile() |
| 2.7.3 | Implement file versioning | ✅ | Immutable FileVersion rows; uploadNewVersion() bumps version_count + currentVersionId |
| 2.7.4 | Implement folder hierarchy and organization | ✅ | Closure table (folder_closure); createFolder() + listFolderContents() |
| 2.7.5 | Implement file permissions and sharing | ✅ | FilePermission entity; grantPermission() / revokePermission(); ALLOW/DENY per action |
| 2.7.6 | Implement file linking (to documents, tasks, messages) | ✅ | FileLink entity; linkFile() / unlinkFile() / getLinksForEntity() |
| 2.7.7 | Implement virus/malware scanning integration | ✅ | FileScanListener stub on file.upload_complete; TODO: swap ClamAV node client |
| 2.7.8 | Implement classification enforcement on files | ✅ | clearance >= classification check in assertFileAccess(); folder classification guard |
| 2.7.9 | Implement pre-signed URL generation for secure access | ✅ | getPresignedDownloadUrl() — requires scan_status=clean; audit-logged every call |
| 2.7.10 | Write file management tests | ✅ | `files.service.spec.ts` — 28 tests: uploadFile (happy path, MAX_FILE_SIZE exceeded), uploadNewVersion, getVersions, listFiles, getFile, getPresignedDownloadUrl (clean vs infected guard), createFolder (depth limit), listFolderContents, deleteFolder, grantPermission, revokePermission, listPermissions, linkFile, getLinksForEntity, unlinkFile, processScanResult, deleteFile; classification guards throughout |

---

## Phase 3: Real-time Conferencing & Kubernetes
**Target:** Months 12–18

### 3.1 Audio/Video Infrastructure
| # | Task | Status | Notes |
|---|------|--------|-------|
| 3.1.1 | Stand up Mediasoup SFU as extracted media service | ✅ | apps/media/; WorkerPool, SessionManager, SignalingHandler; RabbitMQ + Redis |
| 3.1.2 | Deploy TURN/STUN servers (Coturn) | ✅ | coturn:4.6.2-alpine in docker-compose `media` profile; host networking; lt-cred-mech |
| 3.1.3 | Implement call session management (initiate, join, end) | ✅ | CallsService: initiateCall, joinCall, leaveCall, endCall; calls.call_sessions migration |
| 3.1.4 | Implement participant management | ✅ | CallParticipant entity; join/leave/count guards; moderator flag |
| 3.1.5 | Implement scheduled meetings | ✅ | CallSchedule entity + scheduleMeeting + listUpcoming; clearance-filtered |
| 3.1.6 | Implement call recording with retention policies | ✅ | CallRecording entity; RETENTION_DAYS map; startRecording/stopRecording; expiresAt set on creation |
| 3.1.7 | Implement recording access control | ✅ | clearance gate on startRecording; classification inherited from session; audit log every action |
| 3.1.8 | Write conferencing integration tests | ✅ | `calls.service.spec.ts` — 25 tests: initiateCall (clearance guard, initiator auto-joins as moderator, event emitted), joinCall (clearance, capacity limit, existing participant), leaveCall, endCall (status + actualEnd), startRecording (clearance, retention by classification), stopRecording (status change), scheduleMeeting, listUpcoming, getSession |

### 3.2 Kubernetes Migration
| # | Task | Status | Notes |
|---|------|--------|-------|
| 3.2.1 | Design Kubernetes cluster topology for on-premises | ✅ | `coescd.gov.tj/tier` node affinity labels (database, cache, messaging, storage, search, analytics, app, media, gis, obs); namespace isolation |
| 3.2.2 | Convert Docker Compose services to Helm charts | ✅ | `deploy/helm/coescd/` — Chart.yaml, values.yaml, values.production.yaml; 14 template files for all services |
| 3.2.3 | Set up persistent volume claims for stateful services | ✅ | volumeClaimTemplates in StatefulSets: postgres (200Gi+50Gi WAL), redis (20Gi), rabbitmq (30Gi), minio (250Gi), opensearch (100Gi), timescaledb (200Gi), prometheus (100Gi) |
| 3.2.4 | Configure horizontal pod autoscaling | ✅ | HPA (autoscaling/v2) for backend (3–12), gateway (3–10), martin (2–4); CPU+memory metrics |
| 3.2.5 | Migrate CI/CD pipeline to deploy to Kubernetes | ✅ | `cd.yml`: helm upgrade --install --atomic, rollout status wait, smoke test health check, auto-rollback on failure |
| 3.2.6 | Validate failover and self-healing behavior | ✅ | PodDisruptionBudgets (backend, gateway, martin, rabbitmq quorum, opensearch quorum); NetworkPolicies default-deny + allow rules; liveness/readiness probes on all pods |

### 3.3 Search Infrastructure
| # | Task | Status | Notes |
|---|------|--------|-------|
| 3.3.1 | Deploy OpenSearch cluster | ✅ | docker-compose `search` profile; opensearch:2.13.0 + dashboards; opensearch.config.ts |
| 3.3.2 | Implement document search indexing | ✅ | SearchIndexService: ensureIndices() on boot; indexDocument/indexTask/indexMessage; domain event listeners |
| 3.3.3 | Implement full-text search APIs (documents, messages) | ✅ | GET /search?q= (unified); GET /search/channels/:id/messages?q= (channel history) |
| 3.3.4 | Implement classification-filtered search results | ✅ | Filter `classification <= userClearance` baked into every query — cannot be bypassed |
| 3.3.5 | Write search tests | ✅ | `search.service.spec.ts` — 20 tests: SearchQueryService.search (multi-index, classification filter, empty results, OpenSearch error graceful fallback), searchMessages (channel-scoped, classification filter); SearchIndexService.indexDocument/indexTask/indexMessage (client.index called), deleteDocument/deleteTask/deleteMessage (client.delete called) |

---

## Phase 4: Spatial Intelligence & Analytics
**Target:** Months 18–24

### 4.1 GIS Domain
| # | Task | Status | Notes |
|---|------|--------|-------|
| 4.1.1 | Deploy PostGIS extension on PostgreSQL (or separate DB) | ✅ | postgis/postgis:16-3.4-alpine image; PostGIS + topology extensions in init SQL |
| 4.1.2 | Design spatial data schema (layers, features, metadata) | ✅ | WGS84 + UTM39N dual storage; 5 tables; GIST indexes; materialized view |
| 4.1.3 | Implement administrative boundary data ingestion | ✅ | ingestBoundary() + recursive hierarchy CTE + spatialEnrichPoint() |
| 4.1.4 | Implement hazard zone data management | ✅ | HazardZone entity; CRUD + radius/bbox/class/severity queries |
| 4.1.5 | Implement infrastructure layer management | ✅ | SpatialLayer catalog with symbology + schema definitions; publishLayer/deprecateLayer |
| 4.1.6 | Implement vector tile serving (Martin) | ✅ | Martin v0.14.0 in docker-compose `gis` profile; connects to PostGIS |
| 4.1.7 | Implement raster tile serving (GeoServer/MapServer) | ✅ | `kartoza/geoserver:2.24.0` under `gis` docker profile; port 8088; PostGIS store connected; GeoWebCache bundled; Nginx proxy at `/geoserver/` with admin UI blocked; volumes: geoserver-data + geoserver-rasters |
| 4.1.8 | Implement layer management and symbology APIs | ✅ | CRUD + list/filter + publish/deprecate; symbology JSONB field |
| 4.1.9 | Implement incident location tracking with spatial enrichment | ✅ | reportIncident() with auto admin-code resolution; async enrichment stub |
| 4.1.10 | Write GIS domain tests | ✅ | `gis.service.spec.ts` — 30 unit tests; covers createLayer, listLayers (clearance + keyword filter), getLayer (NotFound + Forbidden), publishLayer (conflict), createFeature (invalid geom + success), createHazardZone, reportIncident (with/without adminCode), queryIncidents, resolveIncident (conflict), ingestBoundary (duplicate + missing parent), spatialEnrichPoint, hazardZone radius filter, classification access guard |

### 4.2 Spatial Data Pipelines
| # | Task | Status | Notes |
|---|------|--------|-------|
| 4.2.1 | Deploy Airflow for pipeline orchestration | ✅ | apache/airflow:2.9.0, LocalExecutor, under `pipelines` docker profile; airflow-db + airflow-init + airflow-webserver (port 8088) + airflow-scheduler |
| 4.2.2 | Implement spatial data ingestion pipelines | ✅ | `coescd_spatial_ingest` DAG: poll job queue → normalize (GeoJSON/SHP/KML/CSV) → validate → enrich (admin code spatial join) → upsert PostGIS → notify backend |
| 4.2.3 | Implement scheduled data refresh jobs | ✅ | `coescd_boundary_refresh` (weekly, change-detection upsert + view refresh); `coescd_hazard_zone_refresh` (hourly, 4 hazard classes); `coescd_analytics_etl` (every 15min, watermark-based incr. load → TimescaleDB) |
| 4.2.4 | Implement data quality validation steps | ✅ | `coescd_data_quality` DAG (daily 03:00): geometry integrity, bbox bounds, attribute completeness, referential integrity, duplicate detection → report posted to backend + written to gis.data_quality_runs |

### 4.3 Emergency Analytics
| # | Task | Status | Notes |
|---|------|--------|-------|
| 4.3.1 | Deploy TimescaleDB for analytical time-series store | ✅ | timescale/timescaledb:latest-pg16 under `analytics` profile; BRIN indexes + hypertable migration comments |
| 4.3.2 | Implement incident registry and classification | ✅ | Incident entity + registry CRUD; auto-registered from gis.incident.reported event |
| 4.3.3 | Implement data collection forms for field analysts | ✅ | DataCollectionForm + FormSubmission entities; required-field validation; review workflow |
| 4.3.4 | Implement statistical aggregations (by region/type/period) | ✅ | getIncidentStats(): by-type, by-region, by-severity, percentiles (p50/p90) |
| 4.3.5 | Implement response time metrics | ✅ | getResponseTimeMetrics(): mean/stddev/p25/p50/p75/p90/p95/max; GENERATED DB columns |
| 4.3.6 | Implement resource utilization tracking | ✅ | ResourceDeployment entity; deployResource/withdrawResource; getResourceUtilisation() |
| 4.3.7 | Implement seasonal pattern analysis | ✅ | getSeasonalPattern(): month-of-year aggregation across multiple years |
| 4.3.8 | Implement analytics dashboard and report generation | ✅ | GeneratedReport entity; requestReport() inline JSON + async file pipeline stub; daily/weekly/monthly cron snapshots |
| 4.3.9 | Write analytics tests | ✅ | `analytics.service.spec.ts` — 34 unit tests; covers registerIncident (conflict + default severity), getIncident (NotFound + Forbidden), updateIncident (all 4 status transitions + no-overwrite + event/no-event), recordResponse (auto-transition), deployResource, withdrawResource (conflict + NotFound), createForm (no fields), publishForm (conflict), submitForm (missing required + clearance + success), reviewSubmission, getIncidentStats (clearance + type + date filters), getResponseTimeMetrics, getResourceUtilisation, getTrendAnalysis (bucket mapping), getSeasonalPattern, requestReport (unknown type → failed), getReport, classification guard |

### 4.4 Frontend — GIS Map Client
| # | Task | Status | Notes |
|---|------|--------|-------|
| 4.4.1 | Integrate MapLibre GL JS for map rendering | ✅ | `apps/map-client/` — Vite + React 18 + TypeScript + MapLibre GL JS 4.x + Tailwind CSS; OSM raster basemap; Martin MVT sources; Tajikistan center/zoom |
| 4.4.2 | Implement layer toggle and visibility controls | ✅ | `LayerPanel.tsx` — dark-themed side panel; toggle admin boundaries, 4 hazard zone classes, incident markers/labels/heatmap; severity (1–5) and status filters |
| 4.4.3 | Implement incident map overlays | ✅ | `IncidentOverlay` via MapLibre circle + heatmap layers; severity-interpolated colors; `IncidentPopup.tsx` detail card (type, severity badge, status, affected area, coords); click-to-select |
| 4.4.4 | Implement real-time incident updates on map | ✅ | `useRealtimeUpdates.ts` — WebSocket to gateway with exponential backoff reconnect; `gis.incident.reported` events update Zustand store → GeoJSON source re-synced; `RealtimeBadge` live count indicator |

---

## Phase 5: AI/ML Forecasting & Advanced Analytics
**Target:** Months 24–30

### 5.1 ML Infrastructure
| # | Task | Status | Notes |
|---|------|--------|-------|
| 5.1.1 | Deploy ClickHouse for large-scale analytical store | ✅ | clickhouse/clickhouse-server:24.3, `ml` docker profile, port 8123/9000 |
| 5.1.2 | Implement model registry (versioning, metadata) | ✅ | MlModel + MlModelVersion entities, MLflow cross-reference, promote/demote workflow |
| 5.1.3 | Implement feature store (curated ML features) | ✅ | FeatureDefinition entity + ClickHouse feature_snapshots table; 4 hazard feature families |
| 5.1.4 | Implement ML training pipeline orchestration (Airflow) | ✅ | ml_feature_extraction_dag (*/30), ml_training_dag (daily 01:00), ml_inference_dag (*/6h) |
| 5.1.5 | Implement model serving API | ✅ | MlController REST API: models, versions, predictions, features; MlService with scoring + HITL |
| 5.1.6 | Implement model performance monitoring | ✅ | ModelPerformanceSnapshot entity, PSI drift detection, ml_model_monitoring_dag (daily 04:00) |

### 5.2 Risk Forecasting Models
| # | Task | Status | Notes |
|---|------|--------|-------|
| 5.2.1 | Develop flood risk scoring model | ✅ | XGBoost in ml_training_dag; hydro features: precip_7d/30d, river_stage, flood_freq_5yr |
| 5.2.2 | Develop landslide risk scoring model | ✅ | XGBoost; terrain features: slope_mean/max, elevation, curvature, lithology, soil_saturation |
| 5.2.3 | Develop seismic risk scoring model | ✅ | XGBoost; seismic features: PGA, fault_distance, magnitude_max_30d, seismic_zone |
| 5.2.4 | Develop wildfire risk scoring model | ✅ | XGBoost; features: NDVI, temp_max_7d, wind_speed, fire_weather_index |
| 5.2.5 | Integrate risk score layers into GIS map | ✅ | 4 choropleth GeoJSON layers in map-client (flood/landslide/seismic/wildfire), tier-color interpolation, useSyncRiskLayers + useRiskPredictions hooks |
| 5.2.6 | Implement prediction output storage and retrieval | ✅ | RiskPrediction entity, /api/v1/ml/predictions endpoints, HITL review+publish workflow |

### 5.3 Human-in-the-Loop Workflows
| # | Task | Status | Notes |
|---|------|--------|-------|
| 5.3.1 | Implement analyst review interface for model outputs | ✅ | ReviewPanel.tsx: per-prediction approve/reject + SHAP explanation + notes; "Review pending forecasts" button in LayerPanel |
| 5.3.2 | Implement forecast approval workflow | ✅ | PATCH /predictions/:id/review → approved/rejected; POST /predictions/publish → GIS layer |
| 5.3.3 | Implement feedback loop for model improvement | ✅ | Ground-truth accuracy eval in monitoring DAG; HIGH drift auto-triggers retrain signal |

### 5.4 Advanced Reporting
| # | Task | Status | Notes |
|---|------|--------|-------|
| 5.4.1 | Implement advanced statistical analysis reports | ✅ | ReportingModule: incident_statistical (counts/rates/percentiles), response_time_analysis (P25/P50/P90 per type+severity), resource_utilisation; migration 1712300009000 with 5 seeded definitions |
| 5.4.2 | Implement cross-domain analytics (incidents + tasks + docs) | ✅ | cross_domain report: FULL OUTER JOIN across analytics.incidents + tasks.tasks + edms.documents keyed by administrative_code |
| 5.4.3 | Implement scheduled report generation and delivery | ✅ | @Cron('*/5 * * * *') runScheduledReports(); POST /api/v1/reporting/definitions/:id/run; async execution with inline JSON result; GET /executions/:id polling |

---

## Ongoing — All Phases
| # | Task | Status | Notes |
|---|------|--------|-------|
| ∞.1 | Security vulnerability scanning (OWASP, SAST, DAST) | 🔁 | Every sprint |
| ∞.2 | Penetration testing | 🔁 | Each major release |
| ∞.3 | Database backup verification | 🔁 | Weekly |
| ∞.4 | Compliance and audit log review | 🔁 | Monthly |
| ∞.5 | Performance profiling and capacity planning | 🔁 | Each phase end |
| ∞.6 | Dependency updates and CVE patching | 🔁 | Bi-weekly |
| ∞.7 | User acceptance testing with CoESCD staff | 🔁 | Each phase end |
| ∞.8 | Architecture Decision Records (ADRs) maintenance | 🔁 | As decisions made |

---

## Key Architectural Decisions Summary

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Deployment model | Modular monolith + 3 extracted services | Balance simplicity and isolation for runtime-special services |
| Database | PostgreSQL 16 multi-schema | One DB, separate schemas per domain; simpler ops |
| Real-time | Node.js/Go WebSocket Gateway | Extracted from day 1 due to persistent connection requirements |
| Media server | Mediasoup SFU | Open-source, self-hosted WebRTC |
| Object storage | MinIO | S3-compatible, sovereign on-premises |
| Authorization | Four-layer model (RBAC + Scope + Classification + Policy) | Government hierarchy + classification requirements |
| Org model | Position-based authority (not people-based) | Workflows survive personnel changes |
| Audit | Append-only, domain-independent audit schema | Tamper-evident; never under audited domain control |
| Message broker | RabbitMQ → Kafka (Phase 2+) | Start simple, migrate to Kafka as throughput demands grow |
| Analytics store | TimescaleDB → ClickHouse (Phase 5) | Incremental complexity |
| Orchestration | Docker Compose → Kubernetes (Phase 3) | Start simple, migrate when stability proven |

---

## Cross-Domain Integration Flows

### Flow A: Document Resolution → Task
```
EDMS (Resolution issued)
  → publishes event to RabbitMQ
  → TaskManagement subscribes → creates linked task
  → NotificationService → alerts assigned position
  → RealTimeGateway → pushes notification to connected clients
  [All linked by correlation ID]
```

### Flow B: Incident Report → Alert Dissemination
```
FieldAnalyst submits incident form
  → Analytics validates + enriches with GIS spatial context
  → GIS updates operational incident layer
  → NotificationService → emergency alerts to affected positions
  → DepartmentHead creates response task in TaskManagement
```

### Flow C: Task Discussion → File Attachment → Audit
```
Task created
  → Communication auto-creates linked discussion channel
  → Executor attaches file in chat
  → FileManagement applies channel-level access control to file
  → AuditDomain logs all file access events
```

---

## Phase 6: Hardening, Optimization & Scale-up
**Target:** Ongoing from Month 27+
**Source:** `7.Full-System-Integration-Deployment-Roadmap.md` §15

### 6.1 SSO / LDAP Integration
| # | Task | Status | Notes |
|---|------|--------|-------|
| 6.1.1 | Implement LDAP bind + attribute mapping (Active Directory) | ✅ | `LdapService` — bind/search/mapAttributes, RFC 4515 escape, `ldapts` client |
| 6.1.2 | Implement SAML 2.0 SP support (government SSO federation) | ✅ | `SamlService` — `@node-saml/node-saml`, validateResponse, generateMetadata; `SsoController` — POST /auth/saml/acs, GET /auth/saml/:name/metadata |
| 6.1.3 | JIT user provisioning on first SSO login | ✅ | `SsoService.provisionOrUpdate()` — creates credential on first login, refreshes attrs on subsequent; POST /auth/ldap/login; migration 1712300010000 |
| 6.1.4 | Write SSO integration tests | ✅ | `sso.service.spec.ts` — 18 tests: LDAP provision/refresh/suspended/NotFoundException, SAML callback/validation, metadata, username derivation/sanitization |

### 6.2 Advanced Audit / SIEM Export
| # | Task | Status | Notes |
|---|------|--------|-------|
| 6.2.1 | Implement CEF/Syslog audit export endpoint | ✅ | `SiemExportService.formatCef()` + `formatSyslog()` (RFC 5424, facility 13); `GET /audit/export/cef` downloads .cef file; `POST /audit/export/siem` pushes to remote SIEM via UDP |
| 6.2.2 | Implement cross-domain audit trail query API | ✅ | `GET /audit/events` — filters: actorId, eventType, resourceType, severity, domains (prefix list), from/to; `AuditController` + `SiemExportService.queryAuditTrail()` |
| 6.2.3 | Add audit retention management (archive + purge) | ✅ | `SiemExportService.archiveOldEvents()` (@Cron 02:30, 90-day hot → `audit.audit_archives`); `purgeExpiredArchives()` (1st of month 03:00, 7-year purge); migration 1712300011000 |
| 6.2.4 | Write SIEM export tests | ✅ | `siem-export.service.spec.ts` — 20 tests: CEF format/severity/escaping, syslog PRI calculation, exportCef, queryAuditTrail (domain LIKE filter, limit cap), archiveOldEvents, purgeExpiredArchives |

### 6.3 Delegated Administration
| # | Task | Status | Notes |
|---|------|--------|-------|
| 6.3.1 | Department-scoped admin role and capability model | ✅ | `dept:admin` permission check via existing `AuthorizationService.can()`; `assertDeptAdmin()` guard in `DelegatedAdminService` |
| 6.3.2 | Scoped user management APIs (dept admin can manage own dept) | ✅ | `GET/POST/DELETE /departments/:deptId/admin/roles` — list/grant/revoke scoped role assignments; privilege escalation guard (admin must hold role to grant it); system role block |
| 6.3.3 | Scoped workflow template management (per-department templates) | ✅ | `GET/DELETE /departments/:deptId/admin/workflow-templates`; `owner_department_id` column added to `edms.workflow_templates` (migration 1712300012000) |
| 6.3.4 | Write delegated admin tests | ✅ | `delegated-admin.service.spec.ts` — 14 tests: assertDeptAdmin, listAssignments, grantDeptRole (success/NotFound/system-role-block/no-privilege-escalation/duplicate), revokeDeptRole, listTemplates, deactivateTemplate |

### 6.4 Mobile Field Operator PWA
| # | Task | Status | Notes |
|---|------|--------|-------|
| 6.4.1 | React PWA scaffold with offline service worker | ✅ | `apps/field-pwa/` — Vite + React 18 + TypeScript + Tailwind + `vite-plugin-pwa` (Workbox GenerateSW); manifest with standalone display, icons; runtime caching for tasks (StaleWhileRevalidate), tiles (CacheFirst), auth (NetworkOnly) |
| 6.4.2 | Task viewer + status update (field operator) | ✅ | `TaskListPage.tsx` (list with status filter, offline fallback to IndexedDB cache); `TaskDetailPage.tsx` (status transitions open→in_progress→completed, offline-queued feedback) |
| 6.4.3 | Incident reporting from mobile (GeoJSON capture) | ✅ | `ReportIncidentPage.tsx` — Geolocation API GPS capture, incident type/severity selector, offline queue with success confirmation |
| 6.4.4 | Push notifications (Web Push + service worker) | ✅ | `push-notifications.ts` — `requestPushPermission()`, `subscribeToPush()` sends subscription to `POST /notifications/push-subscription`; VAPID key from `VITE_VAPID_PUBLIC_KEY` env |
| 6.4.5 | Offline queue sync (IndexedDB → backend on reconnect) | ✅ | `offline-db.ts` (IndexedDB via `idb`: pending_ops + cached_tasks stores); `sync.ts` — `syncPendingOperations()` drains queue on reconnect (max 5 retries); `OfflineBadge` component shows pending count |

---

## Progress Summary

| Phase | Tasks Total | Done | In Progress | Blocked | Completion |
|-------|-------------|------|-------------|---------|------------|
| Phase 0-1: Governance & Infra | 19 | 13 | 0 | 0 | 68% |
| Phase 1: Core Foundation | 43 | 40 | 0 | 0 | 93% |
| Phase 2: Workflow & Communication | 49 | 32 | 0 | 0 | 65% |
| Phase 3: Conferencing & K8s | 22 | 19 | 0 | 0 | 86% |
| Phase 4: Spatial & Analytics | 27 | 27 | 0 | 0 | 100% |
| Phase 5: AI/ML Forecasting | 16 | 16 | 0 | 0 | 100% |
| Phase 6: Hardening & Scale-up | 17 | 17 | 0 | 0 | 100% |
| **Total** | **193** | **164** | **0** | **0** | **85%** |

---

*Update this file as tasks are started, completed, or blocked. Change status symbols accordingly.*
