# CoESCD Platform — Implementation Plan

> **Platform:** CoESCD Unified Digital Platform (Tajikistan Emergency Management)
> **Type:** Government-grade, sovereign on-premises enterprise system
> **Total Timeline:** 24–30 months across 6 phases
> **Last Updated:** 2026-04-05 (updated by implementation session)

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
| 0.2.6 | Configure CI/CD pipeline (GitHub Actions or GitLab CI) | ⏳ | |

### 0.3 Observability Stack
| # | Task | Status | Notes |
|---|------|--------|-------|
| 0.3.1 | Deploy Prometheus + Grafana for metrics | ✅ | Provisioned via obs profile |
| 0.3.2 | Deploy Loki for log aggregation | ✅ | Loki + Promtail |
| 0.3.3 | Deploy Jaeger for distributed tracing | ✅ | OTLP receiver |
| 0.3.4 | Configure alerting rules and dashboards | ⏳ | |

### 0.4 Database Architecture
| # | Task | Status | Notes |
|---|------|--------|-------|
| 0.4.1 | Deploy PostgreSQL 16 with multi-schema layout | ✅ | 13 schemas, init SQL |
| 0.4.2 | Configure Redis 7 Cluster for cache and presence | ✅ | Redis 7 with AOF |
| 0.4.3 | Deploy MinIO (S3-compatible object storage) | ✅ | Pinned release |
| 0.4.4 | Deploy RabbitMQ as event/message broker | ✅ | vhost: coescd |
| 0.4.5 | Define database backup and recovery procedures | ⏳ | |
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
| 1.1.8 | Write IAM unit + integration tests | ⏳ | |

### 1.2 Organization & Department Management
| # | Task | Status | Notes |
|---|------|--------|-------|
| 1.2.1 | Design org schema (departments, positions, hierarchies) | ✅ | Closure table tree |
| 1.2.2 | Implement organization CRUD APIs | ✅ | |
| 1.2.3 | Implement department CRUD and hierarchy APIs | ✅ | Tree + descendants |
| 1.2.4 | Implement position CRUD (immutable position definitions) | ✅ | |
| 1.2.5 | Implement command chain traversal logic | ✅ | getCommandChain(), isSubordinateTo() |
| 1.2.6 | Implement organizational change history tracking | ✅ | Append-only org_change_history |
| 1.2.7 | Write org management tests | ⏳ | |

### 1.3 User Management
| # | Task | Status | Notes |
|---|------|--------|-------|
| 1.3.1 | Design user profile schema (beyond identity) | ✅ | UserProfile + clearance level |
| 1.3.2 | Implement user-to-position assignment APIs | ✅ | PRIMARY/ACTING/CONCURRENT + occupant lookup |
| 1.3.3 | Implement user preferences and status management | ✅ | Language, notify channels, quiet hours |
| 1.3.4 | Implement delegation rules | ✅ | Delegation entity in authz schema |
| 1.3.5 | Implement onboarding/offboarding workflows | ✅ | offboard() vacates all positions |
| 1.3.6 | Write user management tests | ⏳ | |

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
| 1.4.8 | Write authorization tests covering all four layers | ⏳ | |

### 1.5 Audit Infrastructure
| # | Task | Status | Notes |
|---|------|--------|-------|
| 1.5.1 | Design audit event schema (append-only, tamper-evident) | ✅ | integrity_hash + severity |
| 1.5.2 | Implement audit event emitter (used by all domains) | ✅ | AuditService.emit() — never throws |
| 1.5.3 | Implement audit log storage (separate schema, no delete) | ✅ | INSERT-only DB grant in init SQL |
| 1.5.4 | Implement audit log read-only query API | ✅ | AuditService.queryEvents() |
| 1.5.5 | Write audit integrity tests | ⏳ | |

### 1.6 EDMS — Basic Document Management
| # | Task | Status | Notes |
|---|------|--------|-------|
| 1.6.1 | Design document schema (types, metadata, states) | ✅ | 5 entities + migration |
| 1.6.2 | Implement document registration and numbering system | ✅ | Advisory lock + sequential seq per series+year |
| 1.6.3 | Implement document state machine (Draft→Registered→Workflow→Completed→Archived) | ✅ | DOCUMENT_TRANSITIONS map |
| 1.6.4 | Implement basic document CRUD APIs | ✅ | EdmsController REST endpoints |
| 1.6.5 | Implement document classification and access control | ✅ | clearanceLevel check in EdmsService |
| 1.6.6 | Implement document versioning | ✅ | Immutable DocumentVersion snapshots |
| 1.6.7 | Write EDMS basic tests | ⏳ | |

### 1.7 Task Management — Basic
| # | Task | Status | Notes |
|---|------|--------|-------|
| 1.7.1 | Design task schema (assignment, hierarchy, executors) | ✅ | Task, TaskType, TaskAssignment, TaskHistory, TaskComment, TaskAttachment entities |
| 1.7.2 | Implement task creation with authority validation | ✅ | Command chain enforcement via OrgService.isSubordinateTo() |
| 1.7.3 | Implement task lifecycle state machine | ✅ | TASK_TRANSITIONS map + assertTransitionAuthority() |
| 1.7.4 | Implement subtask hierarchy (parent-child) | ✅ | parentTaskId + depth + MAX_SUBTASK_DEPTH=3 |
| 1.7.5 | Implement multiple executor support | ✅ | PRIMARY + CO_EXECUTOR assignment types |
| 1.7.6 | Implement deadline tracking and overdue detection | ✅ | markOverdueTasks() + isOverdue flag + EventEmitter |
| 1.7.7 | Write task management tests | ⏳ | |

### 1.8 Real-time Gateway — Foundation
| # | Task | Status | Notes |
|---|------|--------|-------|
| 1.8.1 | Stand up WebSocket server (Node.js or Go) | ✅ | Node.js ws server |
| 1.8.2 | Implement connection authentication (JWT validation) | ✅ | Bearer token + query param |
| 1.8.3 | Implement basic event fan-out to connected clients | ✅ | Room model + sendToUser() |
| 1.8.4 | Integrate gateway with RabbitMQ event bus | ✅ | AMQP topic exchange consumer |
| 1.8.5 | Write WebSocket integration tests | ⏳ | |

---

## Phase 2: Workflow, Communication & Files
**Target:** Months 6–12

### 2.1 EDMS — Full Workflow Engine
| # | Task | Status | Notes |
|---|------|--------|-------|
| 2.1.1 | Implement workflow template definitions per document type | ⏳ | |
| 2.1.2 | Implement multi-stage approval routing | ⏳ | Routes to positions, not people |
| 2.1.3 | Implement vacant position escalation (route to reporting line) | ⏳ | |
| 2.1.4 | Implement resolution issuance model (Chairman issues Resolution) | ⏳ | |
| 2.1.5 | Implement execution assignment and deadline tracking | ⏳ | |
| 2.1.6 | Implement immutable workflow history records | ⏳ | |
| 2.1.7 | Implement document archive management | ⏳ | |
| 2.1.8 | Write full workflow integration tests | ⏳ | |

### 2.2 EDMS → Task Integration
| # | Task | Status | Notes |
|---|------|--------|-------|
| 2.2.1 | Implement document resolution → task creation event flow | ⏳ | |
| 2.2.2 | Implement bidirectional EDMS–Task sync | ⏳ | Task links back to document |
| 2.2.3 | Propagate correlation IDs across EDMS and Task events | ⏳ | |
| 2.2.4 | Write cross-domain integration tests | ⏳ | |

### 2.3 Task Management — Full Features
| # | Task | Status | Notes |
|---|------|--------|-------|
| 2.3.1 | Implement progress tracking and supervisor oversight | ⏳ | |
| 2.3.2 | Implement escalation alerts for overdue tasks | ⏳ | Alert up command chain |
| 2.3.3 | Implement task status propagation (parent blocks on children) | ⏳ | |
| 2.3.4 | Implement task-linked discussion channels | ⏳ | Auto-create on task creation |
| 2.3.5 | Write full task management tests | ⏳ | |

### 2.4 Communication — Chat & Messaging
| # | Task | Status | Notes |
|---|------|--------|-------|
| 2.4.1 | Design channel and message schema | ⏳ | |
| 2.4.2 | Implement direct messages (1-to-1) | ⏳ | |
| 2.4.3 | Implement group channels | ⏳ | |
| 2.4.4 | Implement department channels (auto-derived from org structure) | ⏳ | |
| 2.4.5 | Implement task-linked and document-linked channels | ⏳ | |
| 2.4.6 | Implement emergency broadcast channels (one-way) | ⏳ | |
| 2.4.7 | Implement message threading and read receipts | ⏳ | |
| 2.4.8 | Implement classification-aware message filtering | ⏳ | |
| 2.4.9 | Implement message retention and archival policies | ⏳ | |
| 2.4.10 | Write chat domain tests | ⏳ | |

### 2.5 Real-time Gateway — Presence & Indicators
| # | Task | Status | Notes |
|---|------|--------|-------|
| 2.5.1 | Implement user presence tracking (online/offline/away) | ⏳ | Redis-backed |
| 2.5.2 | Implement typing indicators | ⏳ | |
| 2.5.3 | Implement read receipt delivery via WebSocket | ⏳ | |
| 2.5.4 | Write real-time presence tests | ⏳ | |

### 2.6 Notification Service
| # | Task | Status | Notes |
|---|------|--------|-------|
| 2.6.1 | Design notification schema and delivery channels | ⏳ | In-app, email, SMS |
| 2.6.2 | Implement in-app notification delivery | ⏳ | |
| 2.6.3 | Implement email notification delivery | ⏳ | |
| 2.6.4 | Implement SMS notification delivery | ⏳ | |
| 2.6.5 | Implement user notification preferences | ⏳ | |
| 2.6.6 | Implement notification batching and throttling | ⏳ | |
| 2.6.7 | Implement delivery confirmation tracking | ⏳ | |
| 2.6.8 | Implement alert escalation based on priority | ⏳ | |
| 2.6.9 | Write notification service tests | ⏳ | |

### 2.7 File Management
| # | Task | Status | Notes |
|---|------|--------|-------|
| 2.7.1 | Design file storage schema (metadata, versioning, folders) | ⏳ | MinIO backend |
| 2.7.2 | Implement file upload with MinIO integration | ⏳ | |
| 2.7.3 | Implement file versioning | ⏳ | |
| 2.7.4 | Implement folder hierarchy and organization | ⏳ | |
| 2.7.5 | Implement file permissions and sharing | ⏳ | RBAC-integrated |
| 2.7.6 | Implement file linking (to documents, tasks, messages) | ⏳ | |
| 2.7.7 | Implement virus/malware scanning integration | ⏳ | |
| 2.7.8 | Implement classification enforcement on files | ⏳ | |
| 2.7.9 | Implement pre-signed URL generation for secure access | ⏳ | |
| 2.7.10 | Write file management tests | ⏳ | |

---

## Phase 3: Real-time Conferencing & Kubernetes
**Target:** Months 12–18

### 3.1 Audio/Video Infrastructure
| # | Task | Status | Notes |
|---|------|--------|-------|
| 3.1.1 | Stand up Mediasoup SFU as extracted media service | ⏳ | |
| 3.1.2 | Deploy TURN/STUN servers (Coturn) | ⏳ | For NAT traversal |
| 3.1.3 | Implement call session management (initiate, join, end) | ⏳ | |
| 3.1.4 | Implement participant management | ⏳ | |
| 3.1.5 | Implement scheduled meetings | ⏳ | |
| 3.1.6 | Implement call recording with retention policies | ⏳ | |
| 3.1.7 | Implement recording access control | ⏳ | |
| 3.1.8 | Write conferencing integration tests | ⏳ | |

### 3.2 Kubernetes Migration
| # | Task | Status | Notes |
|---|------|--------|-------|
| 3.2.1 | Design Kubernetes cluster topology for on-premises | ⏳ | |
| 3.2.2 | Convert Docker Compose services to Helm charts | ⏳ | |
| 3.2.3 | Set up persistent volume claims for stateful services | ⏳ | PG, Redis, MinIO |
| 3.2.4 | Configure horizontal pod autoscaling | ⏳ | |
| 3.2.5 | Migrate CI/CD pipeline to deploy to Kubernetes | ⏳ | |
| 3.2.6 | Validate failover and self-healing behavior | ⏳ | |

### 3.3 Search Infrastructure
| # | Task | Status | Notes |
|---|------|--------|-------|
| 3.3.1 | Deploy OpenSearch cluster | ⏳ | |
| 3.3.2 | Implement document search indexing | ⏳ | |
| 3.3.3 | Implement full-text search APIs (documents, messages) | ⏳ | |
| 3.3.4 | Implement classification-filtered search results | ⏳ | |
| 3.3.5 | Write search tests | ⏳ | |

---

## Phase 4: Spatial Intelligence & Analytics
**Target:** Months 18–24

### 4.1 GIS Domain
| # | Task | Status | Notes |
|---|------|--------|-------|
| 4.1.1 | Deploy PostGIS extension on PostgreSQL (or separate DB) | ⏳ | Extracted GIS service |
| 4.1.2 | Design spatial data schema (layers, features, metadata) | ⏳ | WGS84 + UTM39N CRS |
| 4.1.3 | Implement administrative boundary data ingestion | ⏳ | |
| 4.1.4 | Implement hazard zone data management | ⏳ | |
| 4.1.5 | Implement infrastructure layer management | ⏳ | |
| 4.1.6 | Implement vector tile serving (Martin) | ⏳ | |
| 4.1.7 | Implement raster tile serving (GeoServer/MapServer) | ⏳ | |
| 4.1.8 | Implement layer management and symbology APIs | ⏳ | |
| 4.1.9 | Implement incident location tracking with spatial enrichment | ⏳ | |
| 4.1.10 | Write GIS domain tests | ⏳ | |

### 4.2 Spatial Data Pipelines
| # | Task | Status | Notes |
|---|------|--------|-------|
| 4.2.1 | Deploy Airflow for pipeline orchestration | ⏳ | |
| 4.2.2 | Implement spatial data ingestion pipelines | ⏳ | |
| 4.2.3 | Implement scheduled data refresh jobs | ⏳ | |
| 4.2.4 | Implement data quality validation steps | ⏳ | |

### 4.3 Emergency Analytics
| # | Task | Status | Notes |
|---|------|--------|-------|
| 4.3.1 | Deploy TimescaleDB for analytical time-series store | ⏳ | |
| 4.3.2 | Implement incident registry and classification | ⏳ | |
| 4.3.3 | Implement data collection forms for field analysts | ⏳ | |
| 4.3.4 | Implement statistical aggregations (by region/type/period) | ⏳ | |
| 4.3.5 | Implement response time metrics | ⏳ | |
| 4.3.6 | Implement resource utilization tracking | ⏳ | |
| 4.3.7 | Implement seasonal pattern analysis | ⏳ | |
| 4.3.8 | Implement analytics dashboard and report generation | ⏳ | |
| 4.3.9 | Write analytics tests | ⏳ | |

### 4.4 Frontend — GIS Map Client
| # | Task | Status | Notes |
|---|------|--------|-------|
| 4.4.1 | Integrate MapLibre GL JS for map rendering | ⏳ | Open-source Mapbox alternative |
| 4.4.2 | Implement layer toggle and visibility controls | ⏳ | |
| 4.4.3 | Implement incident map overlays | ⏳ | |
| 4.4.4 | Implement real-time incident updates on map | ⏳ | |

---

## Phase 5: AI/ML Forecasting & Advanced Analytics
**Target:** Months 24–30

### 5.1 ML Infrastructure
| # | Task | Status | Notes |
|---|------|--------|-------|
| 5.1.1 | Deploy ClickHouse for large-scale analytical store | ⏳ | Replaces TimescaleDB at scale |
| 5.1.2 | Implement model registry (versioning, metadata) | ⏳ | |
| 5.1.3 | Implement feature store (curated ML features) | ⏳ | |
| 5.1.4 | Implement ML training pipeline orchestration (Airflow/Prefect) | ⏳ | |
| 5.1.5 | Implement model serving API | ⏳ | |
| 5.1.6 | Implement model performance monitoring | ⏳ | |

### 5.2 Risk Forecasting Models
| # | Task | Status | Notes |
|---|------|--------|-------|
| 5.2.1 | Develop flood risk scoring model | ⏳ | |
| 5.2.2 | Develop landslide risk scoring model | ⏳ | |
| 5.2.3 | Develop seismic risk scoring model | ⏳ | |
| 5.2.4 | Develop wildfire risk scoring model | ⏳ | |
| 5.2.5 | Integrate risk score layers into GIS map | ⏳ | |
| 5.2.6 | Implement prediction output storage and retrieval | ⏳ | |

### 5.3 Human-in-the-Loop Workflows
| # | Task | Status | Notes |
|---|------|--------|-------|
| 5.3.1 | Implement analyst review interface for model outputs | ⏳ | AI forecasts inform, not automate |
| 5.3.2 | Implement forecast approval workflow | ⏳ | |
| 5.3.3 | Implement feedback loop for model improvement | ⏳ | |

### 5.4 Advanced Reporting
| # | Task | Status | Notes |
|---|------|--------|-------|
| 5.4.1 | Implement advanced statistical analysis reports | ⏳ | |
| 5.4.2 | Implement cross-domain analytics (incidents + tasks + docs) | ⏳ | |
| 5.4.3 | Implement scheduled report generation and delivery | ⏳ | |

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

## Progress Summary

| Phase | Tasks Total | Done | In Progress | Blocked | Completion |
|-------|-------------|------|-------------|---------|------------|
| Phase 0-1: Governance & Infra | 19 | 10 | 0 | 0 | 53% |
| Phase 1: Core Foundation | 43 | 36 | 0 | 0 | 84% |
| Phase 2: Workflow & Communication | 49 | 0 | 0 | 0 | 0% |
| Phase 3: Conferencing & K8s | 22 | 0 | 0 | 0 | 0% |
| Phase 4: Spatial & Analytics | 27 | 0 | 0 | 0 | 0% |
| Phase 5: AI/ML Forecasting | 16 | 0 | 0 | 0 | 0% |
| **Total** | **176** | **0** | **0** | **0** | **0%** |

---

*Update this file as tasks are started, completed, or blocked. Change status symbols accordingly.*
