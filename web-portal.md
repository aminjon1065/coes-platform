# CoESCD Web Portal Frontend Architecture

## 1. Architecture Overview

### 1.1 Final Architecture Decision

The target frontend architecture for CoESCD is:

- A single **Next.js App Router portal** for all office, command, and analytical web workflows.
- A **separate Field PWA** retained as a dedicated deployable for degraded-network and intermittent-connectivity operations.
- The current standalone **GIS desktop web client is absorbed into the Next.js portal** as a bounded subsystem, not preserved as a separate office-facing application.

This architecture is the correct fit for the current platform because the dominant constraints are:

- unified authorization enforcement
- classification-aware rendering
- shared audit semantics
- consistent shell/navigation/search
- reduced surface area for security review
- maintainable rollout with a small-to-medium engineering team

The current frontend baseline in the repository confirms that the existing web surface is fragmented:

- `apps/web` is a Vite SPA for dashboard, EDMS, tasks, notifications, and admin.
- `apps/map-client` is a separate Vite GIS surface.
- `apps/field-pwa` already contains offline queue and service worker logic tailored for field usage.

The fragmentation is acceptable for prototyping but becomes a liability for production because it duplicates authentication assumptions, increases permission drift, and makes classification control harder to prove during audit.

### 1.2 Why the Portal Is a Single Next.js Application

The office-facing system should be one deployable web portal because:

| Concern | Single Portal Outcome | Micro-frontend Outcome |
|---|---|---|
| Authorization | One middleware, one BFF, one session model | Duplicated auth edges and inconsistent permission enforcement |
| Classification | Centralized response filtering and page-level controls | Higher risk of data overfetch and inconsistent redaction |
| Auditability | Unified action correlation and route ownership | Fragmented correlation across remotes |
| UX | Shared shell, search, notifications, navigation | Cross-app transitions and duplicated state bootstrapping |
| Delivery risk | Moderate and controllable | High for current team size and repo maturity |
| Runtime | One SSR/RSC pipeline | Distributed build and runtime contract complexity |

### 1.3 Why Not Micro-Frontends

Micro-frontends are explicitly rejected for the primary portal.

Reasons:

1. The backend is already a modular monolith plus extracted services. The frontend should not add an extra layer of distributed complexity before the domain boundaries are operationally mature.
2. The most sensitive rules in the system are cross-cutting, not domain-local: classification, hierarchical authority, workflow state restrictions, audit metadata, and emergency-mode behavior.
3. The current codebase does not have a mature shared design system, package governance, or contract discipline strong enough to support safe micro-frontend autonomy.
4. The platform does not need independent frontend team deployment velocity more than it needs consistent control and predictability.
5. Government systems are audited as end-to-end systems. A fragmented browser runtime complicates traceability and security assurance.

Micro-frontends may become relevant only if all of the following become true:

- multiple independent frontend teams exist
- design system and contracts are already stable
- portal domains require independent release cadence
- security review automation for cross-remote integration exists

That is not the current state.

### 1.4 Why the Field PWA Remains Separate

The Field PWA should remain separate because its runtime constraints are materially different from office portal constraints.

The Field PWA must optimize for:

- intermittent connectivity
- background sync
- IndexedDB-backed local queues
- service worker control
- constrained device performance
- simplified workflows for field personnel

The current implementation already contains field-specific offline infrastructure:

- IndexedDB queueing in `apps/field-pwa/src/lib/offline-db.ts`
- queue draining in `apps/field-pwa/src/lib/sync.ts`
- service worker caching and push in `apps/field-pwa/src/sw.ts`

This is not just another portal route. It is a distinct operational client with its own failure-mode requirements. It should share packages, tokens, API contracts, and auth rules with the portal, but it should not be forced into the same deployment unit.

### 1.5 Why GIS Is Absorbed Into the Portal

The current standalone GIS client should not remain a separate office application.

Reasons:

- GIS events, documents, tasks, and analytics are tightly coupled operationally.
- Analysts need map context while working in EDMS, tasks, and dashboards.
- A separate GIS app creates shell fragmentation and duplicate authentication bootstrapping.
- Modern Next.js can host the GIS subsystem as a client-heavy bounded route while still preserving SSR/RSC for the rest of the portal.

Constraint:

- GIS remains a **frontend subsystem with internal boundaries**, not a generic page. It will have a dedicated module architecture, performance budget, and selective client-only execution.

### 1.6 System Boundaries

The web portal owns:

- authenticated office-facing UI
- route composition
- BFF endpoints
- UI-level anti-corruption mapping
- server-side prefetch and hydration
- real-time event adaptation into UI caches
- classification-aware presentation and redaction enforcement at the frontend boundary

The web portal does not own:

- business authority decisions
- source-of-truth workflow state
- source-of-truth task/doc/chat/gis records
- direct object storage policy
- primary audit storage

Those remain backend responsibilities.

---

## 2. Strangler Migration Strategy

### 2.1 Migration Principle

Migration from `apps/web` and `apps/map-client` to `apps/portal-web` must be done using a strangler pattern, not a big-bang rewrite.

Core rules:

- Next.js runs in parallel with the existing Vite apps.
- Route ownership moves domain by domain.
- Authentication model is migrated first.
- New code is written only in the Next.js portal once the target route exists.
- Existing Vite pages are used as temporary fallbacks until each domain is cut over.

### 2.2 Migration Phases at Runtime

| Step | Owner | Runtime Behavior |
|---|---|---|
| Step 1 | Existing Vite web | Default owner for most office routes |
| Step 2 | Next.js portal | Owns `/login`, session bootstrapping, and shared shell |
| Step 3 | Next.js portal | Takes over dashboard and notifications |
| Step 4 | Next.js portal | Takes over tasks |
| Step 5 | Next.js portal | Takes over EDMS |
| Step 6 | Next.js portal | Takes over GIS |
| Step 7 | Next.js portal | Takes over admin and cross-domain search |
| Step 8 | Legacy apps removed | Vite web retired; standalone map client retired for office users |

### 2.3 Domain-by-Domain Migration Order

#### Auth

Auth migrates first because the current SPA stores tokens in persisted Zustand, which is unacceptable for production.

Actions:

- create Next.js session endpoints
- move login/logout/refresh into BFF
- establish `httpOnly` cookie-based session
- add middleware-based route protection
- make legacy Vite app consume shared session if temporary coexistence is required

Exit criterion:

- browser-accessible tokens are eliminated for the office portal

#### Dashboard

Dashboard migrates second because it is mostly read-heavy and touches multiple domains without requiring deep workflow editing.

Actions:

- build portal shell
- implement `/dashboard`
- aggregate summary cards through BFF
- preload notifications/task/document summaries server-side

Exit criterion:

- dashboard route is served entirely from Next.js

#### Tasks

Tasks migrate third because they are operationally central and benefit immediately from BFF normalization and real-time cache updates.

Actions:

- migrate task list, detail, oversight, comments, transitions
- implement server-side filtering and permission-aware actions
- integrate websocket task events into query cache

Exit criterion:

- all `/tasks/*` routes served from Next.js

#### EDMS

EDMS migrates fourth because it is high-complexity, stateful, and classification-sensitive.

Actions:

- implement document list/detail
- implement workflow timeline and transition controls
- implement version history and attachment handling
- move document routing and transition UI to permission-aware step engine

Exit criterion:

- all `/edms/*` routes served from Next.js

#### GIS

GIS migrates fifth because it is performance-sensitive and should be moved only after auth, shell, and BFF patterns are proven.

Actions:

- fold `map-client` into portal route group
- preserve client-only rendering for map canvas
- migrate layer, incident, and overlay state to shared GIS subsystem
- integrate task/document/deep links into map interactions

Exit criterion:

- office users access GIS through portal `/gis`

### 2.4 Routing Strategy During Migration

Recommended ingress behavior:

- Next.js becomes the primary external web entrypoint.
- Unmigrated routes are proxied to legacy Vite apps behind internal paths.
- Authentication is centralized in Next.js even while some content still comes from legacy surfaces.

Target route ownership table during migration:

| Route Prefix | Initial Owner | Final Owner |
|---|---|---|
| `/login` | Next.js | Next.js |
| `/` | Vite web, then Next.js | Next.js |
| `/dashboard` | Vite web, then Next.js | Next.js |
| `/tasks` | Vite web, then Next.js | Next.js |
| `/edms` | Vite web, then Next.js | Next.js |
| `/notifications` | Vite web, then Next.js | Next.js |
| `/admin` | Vite web, then Next.js | Next.js |
| `/gis` | standalone map-client, then Next.js | Next.js |

### 2.5 Proxy / Fallback Pattern

During migration, Next.js middleware or route handlers can forward unmatched legacy-owned routes to the existing Vite service.

Pattern:

- Next.js handles auth/session/middleware first.
- If route is not migrated, BFF sets headers/cookies needed for legacy compatibility.
- A reverse proxy forwards the request to the Vite app.

This keeps user entry unified while allowing phased ownership transfer.

### 2.6 Shared Compatibility Layer for Migration

Temporary compatibility package:

- `packages/auth-client-legacy`
- reads BFF session bootstrap endpoint
- exposes current user/session status for legacy Vite apps
- prohibits direct token persistence

This package exists only for migration and must be deleted after Vite retirement.

### 2.7 Migration Risk Mitigation

| Risk | Mitigation |
|---|---|
| Session mismatch between apps | Next.js becomes sole session authority before route migration |
| Inconsistent route behavior | Route ownership registry maintained in config and ingress rules |
| UI contract drift | BFF ACL and anti-corruption mapping introduced before deep module migration |
| Realtime duplication | New realtime client introduced once, consumed by both portal and migrated modules |
| GIS performance regression | GIS cutover delayed until portal shell and dynamic loading patterns are proven |
| Team splitting effort across old/new code | Freeze feature work in migrated domains on legacy apps |

---

## 3. BFF Architecture

### 3.1 BFF Role

The Next.js portal contains a strict Backend-for-Frontend layer under `app/api/*`.

The BFF is mandatory. The browser must not talk directly to NestJS domain APIs for office workflows.

The BFF exists to:

- own session-bound communication with backend services
- normalize multi-domain responses
- enforce frontend-boundary security rules
- remove backend DTO leakage from the browser
- apply page-specific shaping
- centralize correlation IDs and audit headers
- block accidental overfetch of classified fields

### 3.2 BFF Responsibilities

| Responsibility | Description |
|---|---|
| API aggregation | combine backend responses for dashboard, task detail sidebars, document panels |
| Security enforcement | attach service headers, enforce session, deny anonymous calls |
| Classification filtering | remove fields or reject requests beyond effective user clearance |
| Response normalization | map backend DTOs into UI contracts |
| Error normalization | translate backend errors into stable UI-facing error types |
| Upload/download brokerage | sign and proxy file operations |
| Correlation propagation | attach request IDs and actor metadata to backend calls |
| Caching control | set no-store/private behavior per endpoint sensitivity |

### 3.3 BFF Interaction Model

Browser flow:

1. Browser requests portal route.
2. Server components and route handlers call internal service clients.
3. Service clients call NestJS APIs and, when needed, gateway or GIS services.
4. BFF maps backend data into UI contracts.
5. Server component renders with already filtered data.

Mutation flow:

1. Browser submits action to `/api/*`.
2. BFF validates session and request schema.
3. BFF forwards call to the correct backend domain.
4. BFF maps response or normalized error.
5. Client invalidates or patches query cache.

### 3.4 Endpoint Design Principles

- Endpoints are shaped for frontend use cases, not backend resource purity.
- Endpoints are domain-oriented but can aggregate where UX requires it.
- Endpoints must return contracts stable enough for UI use without leaking backend internals.
- Each endpoint has explicit cache policy and classification handling policy.

### 3.5 Example Endpoint Shapes

#### `GET /api/dashboard`

Purpose:

- aggregate dashboard cards and recent activity in one request

Aggregates:

- task summary
- unread notifications
- document workflow summary
- risk alert summary

Why aggregated:

- dashboard is shell-critical
- cross-domain cards must land in one server render cycle
- browser waterfall is avoided

#### `GET /api/tasks`

Purpose:

- return UI-ready paginated task list model

BFF responsibilities:

- map backend enums to UI-safe values
- inject `availableActions` based on effective permission/context
- normalize pagination/filter metadata
- omit fields not required for list rendering

#### `GET /api/documents`

Purpose:

- return EDMS list model with classification-safe summaries

BFF responsibilities:

- enforce classification ceiling before data reaches client
- map workflow states to timeline status summaries
- shape document owner and routing metadata for grids and filter bars

### 3.6 BFF Example Contract

```ts
type TaskListItem = {
  id: string;
  title: string;
  status: "draft" | "assigned" | "in_progress" | "blocked" | "completed" | "cancelled";
  priority: "low" | "medium" | "high" | "critical";
  dueAt: string | null;
  assignee: {
    id: string;
    displayName: string;
    positionTitle: string | null;
  } | null;
  hierarchy: {
    depth: number;
    parentTaskId: string | null;
    childCount: number;
  };
  escalation: {
    isOverdue: boolean;
    escalationLevel: 0 | 1 | 2 | 3;
  };
  availableActions: string[];
};
```

This is intentionally not a backend DTO. It is a UI contract.

### 3.7 File Upload and Download Handling

Files must never be uploaded directly from the browser to backend object storage endpoints without BFF control.

Upload policy:

- browser requests upload intent from BFF
- BFF validates session, purpose, classification, file size, and allowed mime types
- BFF obtains signed upload contract or proxies stream to backend
- BFF returns opaque upload reference

Download policy:

- browser requests file via BFF
- BFF validates entitlement and classification
- BFF either streams from backend/object storage or returns short-lived signed URL
- all accesses emit correlation/audit metadata

For highly sensitive documents, prefer BFF streaming over exposing signed object storage URLs to the browser.

### 3.8 Error Handling Strategy

BFF error taxonomy:

- `AUTH_REQUIRED`
- `ACCESS_DENIED`
- `CLASSIFICATION_DENIED`
- `VALIDATION_FAILED`
- `CONFLICT`
- `RATE_LIMITED`
- `UPSTREAM_UNAVAILABLE`
- `UNKNOWN`

Rules:

- no raw backend stack traces or DTO validation payloads reach the browser
- all errors carry correlation ID
- UI receives stable, typed failures
- conflict and workflow-state mismatch errors are first-class because they are operationally common

---

## 4. Anti-Corruption Layer

### 4.1 Problem Statement

The frontend must not be tightly coupled to NestJS DTOs.

If the browser consumes backend DTOs directly:

- backend internal naming leaks into UI
- backend refactors become frontend breaking changes
- classification filtering becomes inconsistent
- UI components start depending on persistence-oriented structures
- cross-service contract drift becomes harder to manage

### 4.2 Architecture Rule

Each frontend domain owns:

- DTO adapters
- UI domain models
- mapping functions
- normalization rules

The anti-corruption layer sits between:

- service clients that call backend endpoints
- features/entities/widgets that consume UI models

### 4.3 Mapping Layers

| Layer | Purpose |
|---|---|
| Backend DTO | exact service contract from NestJS/extracted services |
| ACL mapper | validate, transform, redact, normalize |
| UI domain model | stable model for frontend entities and features |
| View model | route/widget specific derived model |

### 4.4 Transformation Rules

- enums are normalized to frontend-safe lowercase string unions
- timestamps are left as ISO strings until formatting at view edge
- classification metadata is represented explicitly, never inferred
- hierarchical authority results become boolean capabilities plus explanatory metadata
- workflow transitions are mapped into typed action descriptors
- nullable backend fields are normalized to explicit `null`, not `undefined`

### 4.5 Example

Backend may return:

```ts
type TaskDto = {
  id: string;
  status: "ASSIGNED" | "IN_PROGRESS" | "DONE";
  dueDate?: string;
  assigneeName?: string;
};
```

Frontend entity model should be:

```ts
type Task = {
  id: string;
  status: "assigned" | "in_progress" | "completed";
  dueAt: string | null;
  assigneeDisplayName: string | null;
};
```

### 4.6 Why This Is Critical Here

This system spans IAM, EDMS, tasks, chat, GIS, analytics, notifications, and ML. Those domains will evolve at different rates. Without an anti-corruption layer, the frontend will become a thin transport shell for backend implementation detail and will be expensive to audit, hard to refactor, and prone to accidental data exposure.

---

## 5. Project Structure

### 5.1 Monorepo Shape

```text
apps/
  portal-web/
    src/
      app/
        (public)/
          login/
          unauthorized/
        (secure)/
          layout.tsx
          dashboard/
          tasks/
          edms/
          communication/
          gis/
          analytics/
          notifications/
          admin/
          settings/
        api/
          auth/
          dashboard/
          tasks/
          documents/
          chat/
          gis/
          analytics/
          notifications/
          files/
        globals.css
        providers.tsx
        middleware.ts
      widgets/
        app-shell/
        global-search/
        page-toolbar/
        classification-banner/
        notification-center/
        activity-rail/
      features/
        auth/
        session/
        permission-guards/
        workflow-engine/
        workflow-timeline/
        workflow-actions/
        document-editor/
        document-versioning/
        document-routing/
        task-board/
        task-hierarchy/
        task-comments/
        chat-composer/
        channel-presence/
        map-layers/
        map-selection/
        map-risk-overlays/
        report-filters/
        notification-preferences/
      entities/
        user/
        session/
        department/
        position/
        role/
        document/
        workflow/
        task/
        message/
        channel/
        incident/
        layer/
        report/
        notification/
      shared/
        api/
          clients/
          contracts/
          mappers/
        auth/
        config/
        constants/
        design/
        hooks/
        lib/
        realtime/
        security/
        stores/
        types/
        ui/
        utils/
        validation/
      tests/
      stories/
  field-pwa/
packages/
  ui/
  ui-enterprise/
  api-contracts/
  auth-client/
  realtime-client/
  gis-core/
  analytics-core/
  eslint-config/
  tsconfig/
  testing/
```

### 5.2 Layer Responsibilities

#### `app/`

Contains:

- route segments
- server components
- layouts
- route metadata
- API route handlers
- server-side data orchestration

Must not contain:

- reusable business logic
- entity mapping rules
- raw fetch clients scattered by route

#### `features/`

Contains:

- user actions
- business interaction flows
- mutation orchestration
- domain-specific local UI state

Examples:

- document transition action panel
- task reassignment form
- chat composer with attachment upload

#### `entities/`

Contains:

- core domain UI models
- query keys
- selectors
- lightweight entity presentation components
- mapping utilities specific to the entity

#### `widgets/`

Contains:

- composed page sections reused across routes

Examples:

- app shell
- notification center
- task detail sidebar
- document history rail

#### `shared/`

Contains:

- cross-cutting framework code
- api client infrastructure
- security helpers
- validation helpers
- generic UI primitives not tied to one business domain

### 5.3 Dependency Rules

Allowed dependency direction:

```text
app -> widgets -> features -> entities -> shared
app -> features -> entities -> shared
widgets -> entities -> shared
features -> shared
entities -> shared
```

Disallowed:

- `shared` importing from any domain layer
- `entities` importing from `features`
- `features` importing from `widgets`
- cross-domain imports between unrelated features without going through `entities` or shared contracts

### 5.4 Import Boundaries

Rules:

- use path aliases per layer and package
- enforce with ESLint and dependency-cruiser
- forbid relative imports crossing layer roots

Examples:

- allowed: `@/entities/task/model/task.ts`
- disallowed: `../../../../features/tasks/internal/...`

### 5.5 Package Strategy

Packages to extract early:

- `packages/ui`
- `packages/ui-enterprise`
- `packages/api-contracts`
- `packages/realtime-client`
- `packages/gis-core`
- `packages/testing`

Packages to avoid extracting too early:

- domain-specific feature logic
- route-specific compositions

Over-extraction early in the migration would slow delivery.

---

## 6. Domain Modules

## 6.1 IAM

### UI Architecture

IAM in the portal covers:

- login
- session restoration
- forced password reset
- optional SSO redirect flow
- device/session awareness
- permission-aware shell rendering

Route groups:

- `(public)/login`
- `(secure)/settings/security`
- `(secure)/admin/iam/*`

### Key Components

- `LoginForm`
- `SsoRedirectButton`
- `SessionExpiredDialog`
- `ForcePasswordResetForm`
- `PermissionBoundary`
- `SessionActivityList`

### State Model

- session is server-derived
- current actor and effective permissions are injected at shell render
- short-lived session context is mirrored client-side only for convenience
- no browser token persistence

### Interaction Flows

1. User accesses portal.
2. Middleware validates session cookie.
3. Secure routes load actor profile, positions, clearance, and capability summary.
4. Shell renders only authorized navigation groups.
5. Features request finer-grained action descriptors per screen from BFF.

### Permission-Aware UI

Permission rendering must use server-provided capability summaries and action descriptors, not hard-coded role names.

Bad:

- `if user.role === 'admin'`

Required:

- `if availableActions.includes('task.reassign')`

## 6.2 EDMS

### UI Architecture

EDMS is the most complex office-facing domain and must be modeled as a set of coordinated surfaces, not a simple documents page.

Primary routes:

- `/edms`
- `/edms/inbox`
- `/edms/archive`
- `/edms/[documentId]`
- `/edms/[documentId]/versions`
- `/edms/[documentId]/workflow`
- `/edms/compose`
- `/edms/templates`

Page composition:

- list/inbox views for operational triage
- document detail as primary workspace
- version history as immutable audit trail
- workflow view as state machine renderer
- compose/edit surface for pre-registration or permitted revision phases

### Internal EDMS Module Structure

```text
features/
  document-editor/
  document-metadata-form/
  document-classification-picker/
  document-attachments/
  document-routing/
  document-versioning/
  workflow-actions/
  workflow-delegation/
  workflow-timeline/
entities/
  document/
  workflow/
  attachment/
widgets/
  document-detail-layout/
  document-summary-panel/
  document-history-rail/
  workflow-sidebar/
```

### Key Components

- `DocumentGrid`
- `DocumentFilterBar`
- `DocumentDetailHeader`
- `ClassificationBanner`
- `DocumentMetadataPanel`
- `AttachmentList`
- `VersionHistoryTable`
- `WorkflowTimeline`
- `WorkflowActionPanel`
- `ResolutionPanel`
- `ExecutionAssignmentsPanel`
- `DocumentAuditRail`

### State Model

Server state:

- document summaries
- document detail
- workflow state
- version snapshots
- attachment metadata
- action descriptors

Client state:

- local editor buffer
- side panel visibility
- selected version diff scope
- upload queue UI state
- optimistic comment/annotation overlays where allowed

Form state:

- compose/edit forms
- transition forms
- delegation forms
- resolution issuance forms

### Interaction Flows

#### Document Intake / Registration

1. User opens inbox or create flow.
2. BFF returns allowed document types and metadata schema for the actor.
3. User enters metadata and uploads files.
4. BFF validates classification, file rules, and position-based authority.
5. Draft is saved or document is registered.
6. Workflow state and timeline initialize.

#### Workflow Action

1. Document detail page loads current workflow state and allowed transitions.
2. UI renders only actions explicitly returned by BFF.
3. User performs approve/reject/return/route/delegate/escalate action.
4. BFF submits mutation and returns new workflow snapshot.
5. Timeline, action panel, and status indicators update atomically.

#### Version Inspection

1. User opens version history.
2. UI lists immutable versions with actor, time, reason, and attachment set.
3. User compares versions through a diff panel.
4. Restricted versions are omitted or redacted based on entitlement.

### Special EDMS Rules

- Classification labels are always visible when document access is allowed.
- Attachment access is evaluated independently of document access because annexes may carry stricter classifications.
- Workflow action buttons must never be rendered from client inference.
- Current approver, delegated actor, and escalation reason must be explicit in the UI.
- All document detail layouts include a persistent audit/timeline rail.

## 6.3 Tasks

### UI Architecture

Primary routes:

- `/tasks`
- `/tasks/board`
- `/tasks/oversight`
- `/tasks/[taskId]`

Primary views:

- personal queue
- team board
- supervisor oversight tree
- detail workspace

### Key Components

- `TaskGrid`
- `TaskBoard`
- `TaskHierarchyTree`
- `TaskDetailHeader`
- `TaskStatusStepper`
- `EscalationBadge`
- `DeadlineIndicator`
- `AssignmentPanel`
- `TaskCommentsPanel`
- `RelatedDocumentPanel`

### State Model

Server state:

- task lists
- task detail
- hierarchy
- comments
- available actions

Client state:

- board filters
- expanded hierarchy nodes
- selected columns
- optimistic transition state

### Interaction Flows

- personal execution flow
- supervisor monitoring flow
- parent-child blocking visibility
- reassignment/escalation flow
- task-chat side panel integration

### Task-Specific Rules

- escalation and overdue state must be represented visually and semantically
- action availability is permission- and workflow-aware
- hierarchy is first-class, not a detail tab

## 6.4 Communication (Chat)

### UI Architecture

Routes:

- `/communication`
- `/communication/channels/[channelId]`
- `/communication/dm/[peerId]`

Chat must render as a bounded subsystem with persistent sidebar and message pane, not as a modal.

### Key Components

- `ChannelList`
- `ChannelHeader`
- `MessageList`
- `MessageComposer`
- `ThreadPanel`
- `PresenceAvatar`
- `ReadReceiptStrip`
- `TypingIndicator`
- `AttachmentTray`

### State Model

Server state:

- channel list
- message history
- membership
- unread counts

Ephemeral client state:

- draft composer content
- typing state
- presence cache
- optimistic outbound messages

### Interaction Flows

- join/load channel
- send message
- reply in thread
- mark read
- observe presence/typing
- attach file

### Communication Rules

- classification and channel type are always visible
- emergency broadcast channels are read-only for most users
- retention and legal-hold indicators must be displayed where relevant

## 6.5 GIS

### UI Architecture

GIS is a portal subsystem under `/gis`, not a generic page.

Primary routes:

- `/gis`
- `/gis/incidents/[incidentId]`
- `/gis/layers`
- `/gis/analysis`

Route behavior:

- shell and filter chrome can be server-rendered
- map canvas and heavy geospatial interaction run client-side
- data loading uses route-level bootstrapping plus progressive layer hydration

### Internal GIS Module Structure

```text
features/
  map-initialization/
  map-layers/
  map-selection/
  map-drawing/
  map-realtime/
  map-risk-overlays/
  map-exports/
  spatial-query/
entities/
  incident/
  layer/
  feature/
  risk-model/
widgets/
  gis-layout/
  layer-tree-panel/
  map-toolbar/
  incident-inspector/
  risk-overlay-panel/
  temporal-control/
shared/
  realtime/
  ui/
packages/
  gis-core/
```

### Key Components

- `MapPanel`
- `MapCanvas`
- `LayerTree`
- `LegendPanel`
- `IncidentInspector`
- `FeaturePopup`
- `RiskOverlayPanel`
- `TemporalSlider`
- `MapToolbar`
- `SpatialQueryPanel`

### State Model

Server state:

- initial layer catalog
- layer entitlements
- incident summaries
- saved map views
- risk model metadata

Client state:

- camera position
- visible layers
- selected feature
- hover state
- active drawing mode
- temporal filter state
- realtime incident overlays

GIS should use a dedicated Zustand store for pure client interaction state, but backend-derived entities and layer data should remain in TanStack Query.

### Interaction Flows

#### Operational Map Flow

1. Route loads shell and available layer catalog.
2. Client initializes MapLibre map.
3. Visible layers are attached on demand.
4. Incident summaries and overlays populate.
5. WebSocket events patch incident/layer caches.
6. User clicks a feature or incident for detail and linked task/document context.

#### Spatial Query Flow

1. User selects draw or area filter tool.
2. Geometry is captured client-side.
3. BFF forwards spatial query to GIS backend.
4. Results return as normalized feature collections and summary cards.
5. UI updates side panels and overlays.

#### ML Risk Overlay Flow

1. User enables risk model layer.
2. UI requests overlay metadata, confidence ranges, provenance, and timestamp.
3. Overlay is rendered with legend and confidence disclosure.
4. User drills into high-risk zones and linked incident history.

### GIS Rules

- layer visibility is entitlement-aware
- the client must not receive disallowed layer metadata
- large vector feature sets must use tile or windowed query patterns
- popup content is shaped through ACL mappers, not raw feature properties

## 6.6 Analytics

### UI Architecture

Routes:

- `/analytics`
- `/analytics/operations`
- `/analytics/executive`
- `/analytics/reports/[reportId]`

### Key Components

- `DashboardGrid`
- `MetricCard`
- `TrendChart`
- `FilterRail`
- `ReportTable`
- `ExportPanel`
- `InsightReviewPanel`

### State Model

- filters and drill-down UI state in client stores
- data and report payloads in query cache

### Interaction Flows

- filter dashboards
- drill to task/document/gis context
- export governed reports
- review ML-assisted insights

## 6.7 Notifications

### UI Architecture

Notifications exist both as:

- global shell capability
- dedicated inbox route `/notifications`

### Key Components

- `NotificationCenter`
- `NotificationList`
- `NotificationItem`
- `ToastHost`
- `PriorityBanner`
- `PreferencePanel`

### State Model

- inbox data in query cache
- toast queue and live badge counts in ephemeral store

### Interaction Flows

- receive live notifications
- mark read
- bulk acknowledge
- navigate to linked entity

## 6.8 Admin

### UI Architecture

Admin is split by governance area, not a single generic admin page.

Routes:

- `/admin/users`
- `/admin/departments`
- `/admin/positions`
- `/admin/roles`
- `/admin/workflows`
- `/admin/layers`
- `/admin/audit-access`

### Key Components

- `AdminDataGrid`
- `OrgTreeEditor`
- `RoleCapabilityMatrix`
- `WorkflowTemplateEditor`
- `DelegationRegistry`
- `LayerEntitlementEditor`

### State Model

- registry lists in query cache
- form state via React Hook Form + Zod
- draft editor state kept local to admin features

### Admin Rules

- admin navigation must itself be permission-scoped
- sensitive admin actions require confirmation and visible audit impact notes

---

## 7. Workflow UI Engine

### 7.1 Purpose

Workflow behavior exists in EDMS, tasks, delegations, approvals, and escalations. The portal needs a reusable workflow UI engine, not a set of ad hoc buttons.

### 7.2 Responsibilities

The workflow UI engine must:

- render current state and history
- render allowed transitions from server descriptors
- explain why actions are allowed or denied
- support delegation and escalation metadata
- surface due dates and SLA breaches
- produce a consistent timeline and action model across modules

### 7.3 Workflow Contract

The backend/BFF should expose workflow state as:

```ts
type WorkflowView = {
  instanceId: string;
  currentState: string;
  steps: Array<{
    id: string;
    kind: "review" | "approval" | "routing" | "notification" | "execution";
    title: string;
    status: "pending" | "active" | "completed" | "rejected" | "skipped" | "escalated";
    assignee: {
      positionId: string;
      positionTitle: string;
      actorDisplayName: string | null;
    } | null;
    actedAt: string | null;
    remarks: string | null;
    delegation: {
      isDelegated: boolean;
      delegatedFrom: string | null;
      delegatedTo: string | null;
    };
  }>;
  transitions: Array<{
    code: string;
    label: string;
    requiresComment: boolean;
    requiresAssignee: boolean;
    confirmText: string | null;
  }>;
};
```

### 7.4 Workflow Renderer

Renderer components:

- `WorkflowTimeline`
- `WorkflowActionPanel`
- `WorkflowStepCard`
- `TransitionDialog`
- `DelegationNotice`
- `EscalationIndicator`

### 7.5 Permissions-Aware Transitions

The client must never derive allowed transitions from current state alone.

Allowed transitions come from the server because they depend on:

- capability grants
- hierarchical scope
- current workflow actor
- delegation state
- classification constraints
- time-bound rules

### 7.6 Timeline Visualization

Timeline must show:

- chronological history
- pending and active steps
- delegated actions
- remarks/reasons
- deadline breaches
- actor vs acting-on-behalf-of context

### 7.7 Workflow Engine Usage

Domains using the workflow UI engine:

- EDMS approvals and routing
- task lifecycle transitions
- escalation review
- delegation review and approval

---

## 8. GIS Module Architecture

### 8.1 GIS as a Frontend Subsystem

GIS is a subsystem with its own internal architecture because it combines:

- client rendering engine
- geospatial service contracts
- realtime event application
- high-volume datasets
- analytical overlays
- domain cross-links into tasks, incidents, and documents

### 8.2 Subsystem Layers

| Layer | Responsibility |
|---|---|
| GIS Shell | route composition, layout, toolbars, panels |
| Map Runtime | MapLibre instance lifecycle, camera, handlers |
| Layer Manager | active layers, ordering, entitlements, legends |
| Data Access | tile URLs, feature queries, saved views, spatial search |
| Realtime Adapter | incident and overlay event application |
| Overlay Engine | ML risk overlays, temporal layers, hazard visualization |

### 8.3 Package Strategy

`packages/gis-core` should contain:

- MapLibre bootstrapping
- layer registration interfaces
- geometry helpers
- coordinate transforms
- reusable popup plumbing
- map event typings

Do not place page-specific React components in `gis-core`.

### 8.4 Separation of Concerns

Rules:

- map runtime manages map instance lifecycle only
- layer manager decides what layers are shown
- panels render UI state, not raw map internals
- feature query clients live outside components
- websocket event handling writes into GIS stores/query cache, not directly into map instance logic

### 8.5 Layer System

Layer categories:

- base layers
- reference layers
- operational incident layers
- infrastructure layers
- hazard layers
- ML risk overlays
- user drawing layers

Each layer descriptor includes:

- id
- source type
- classification
- required entitlement
- caching policy
- legend metadata
- refresh policy
- min/max zoom

### 8.6 Real-Time Updates

GIS real-time events include:

- incident reported
- incident updated
- incident resolved
- layer refresh invalidated
- risk overlay published

Update path:

1. websocket receives event
2. realtime adapter validates payload type
3. query cache and GIS store are patched
4. visible map sources re-render as needed

### 8.7 Spatial Queries

Spatial query patterns:

- point identify
- bounding box feature query
- polygon selection
- incident-nearby search
- infrastructure-in-zone query

All server-bound spatial queries go through BFF so:

- authorization and classification are enforced
- geometry payloads are validated
- outputs are normalized for UI use

### 8.8 Performance Considerations

- use vector tiles or server-windowed queries for large feature sets
- dynamic import GIS bundle separately from portal shell
- avoid putting map instance into React state
- virtualize large layer trees and result tables
- debounce camera-bound requests
- apply source updates incrementally instead of reinitializing map layers

### 8.9 Failure Modes

GIS must degrade safely:

- if websocket drops, map remains usable with stale badge
- if a tile source fails, layer displays failure state but shell remains intact
- if risk overlay metadata is missing provenance, overlay is not rendered as actionable

---

## 9. Real-Time Architecture

### 9.1 Principles

- one browser-side realtime client per portal session context
- event adapters per domain
- query cache is the canonical UI server-state cache
- ephemeral signals stay out of durable caches

### 9.2 WebSocket Integration

The portal uses a shared realtime client package.

Responsibilities:

- connection lifecycle
- authentication bootstrap via session-backed endpoint
- subscription management
- reconnect/backoff
- event dispatch to domain adapters

### 9.3 Event to UI Mapping

| Domain Event | UI Effect |
|---|---|
| `task.updated` | patch task detail and invalidate list summaries |
| `task.overdue` | raise escalation badge/banner |
| `edms.workflow.changed` | patch workflow timeline and action panel |
| `chat.message.created` | append message, update unread counts |
| `chat.presence.changed` | update ephemeral presence store |
| `notifications.created` | push toast and inbox badge increment |
| `gis.incident.reported` | patch incident cache and visible overlays |
| `analytics.report.ready` | update report status list |

### 9.4 Cache Synchronization Strategy

Rules:

- domain adapters translate event payloads into query patches or invalidations
- event handlers must be idempotent
- query keys are domain-owned, not route-owned
- expensive list invalidations are replaced with targeted patching where feasible

### 9.5 Optimistic Updates

Use optimistic updates for:

- chat sends
- read receipts
- notification read state
- some task comments

Use guarded optimistic updates, or none, for:

- EDMS approvals
- classification changes
- workflow routing
- high-authority reassignments

These actions have higher conflict cost and must wait for authoritative confirmation.

### 9.6 Reconnection Strategy

- exponential backoff with jitter
- resume subscriptions automatically
- fetch reconciliation snapshots after reconnect
- stale/live indicator shown in shell for affected domains

### 9.7 Presence and Typing

Presence and typing are:

- not persisted in React Query
- held in ephemeral store with TTL
- reset aggressively on disconnect/reconnect

---

## 10. Security Architecture

### 10.1 Session Model

Office portal security model:

- `httpOnly` secure session cookies
- refresh/session handled server-side
- no token storage in `localStorage`, `sessionStorage`, IndexedDB, or persisted Zustand

This replaces the current SPA pattern where access and refresh tokens are persisted in client state.

### 10.2 Authentication Flow

1. User logs in through BFF.
2. BFF exchanges credentials with IAM.
3. BFF stores session/refresh secret in secure cookies or encrypted server session storage.
4. Browser receives only session context, never raw reusable tokens.

### 10.3 Classification-Aware Rendering

Rules:

- if a page is too sensitive, the page data is denied before render
- if a page is allowed but some fields are not, BFF redacts those fields explicitly
- client components must render redaction state, not hide omitted fields silently

Classification is not a badge-only concern. It is a data minimization constraint.

### 10.4 Data Leakage Prevention

Prevent leakage through:

- URLs: never encode titles, classification labels, or sensitive search terms in route params when avoidable
- logs: redact payloads in client logging and telemetry
- caches: set `private` or `no-store` for sensitive BFF responses
- browser storage: no sensitive entity payload persistence beyond approved offline PWA use
- error surfaces: generic user-facing messages with correlation IDs
- page titles: avoid sensitive names for highly classified records if title could leak on shared displays

### 10.5 BFF Enforcement

BFF must enforce:

- session validity
- CSRF protections on mutations
- request schema validation
- classification ceiling checks where applicable
- file entitlement checks
- correlation ID propagation

### 10.6 UI Security Controls

- strict CSP
- `X-Frame-Options` / frame ancestor restrictions
- Trusted Types where supported
- sanitization for rich text and document preview metadata
- download/open actions wrapped in explicit intent flows for sensitive files

### 10.7 Audit Affordances

The frontend must expose audit context for operators:

- who is acting
- whether they are delegated
- effective position
- classification of current resource
- correlation ID for failed operations

That does not replace backend audit. It makes operational review possible.

---

## 11. Design System

### 11.1 Stack

- `shadcn/ui`
- Tailwind CSS
- Radix primitives

The design system must be packaged, versioned, and used by both portal and Field PWA.

### 11.2 Token Model

#### Colors

- neutral foundation for dense administrative UI
- action blue for primary workflows
- warning amber for deadline risk
- critical red for operational severity
- secure green for confirmed state only
- classification palette distinct from status palette

#### Typography

- primary sans for interface
- tabular numeral support for dashboards
- controlled density scales for operations tables

#### Spacing and Sizing

- 4px scale
- density presets: `comfortable`, `compact`, `operations`

### 11.3 Core Components

- Button
- Input
- Select
- Combobox
- Dialog
- Drawer
- Tabs
- Tooltip
- Toast
- Breadcrumb
- Skeleton
- EmptyState

### 11.4 Enterprise Components

- `DataGrid`
- `WorkflowTimeline`
- `ClassificationBadge`
- `MapPanel`
- `LayerTree`
- `AuditTrail`
- `SplitLayout`
- `FilterBar`
- `BulkActionToolbar`

### 11.5 Accessibility

Minimum target:

- WCAG 2.2 AA

Required controls:

- keyboard navigable grids and trees
- focus visibility
- screen-reader labels for classification and deadlines
- high-contrast support
- reduced motion support
- no color-only encoding

---

## 12. Performance & Scalability

### 12.1 Rendering Strategy

Use RSC by default for:

- shell layout
- dashboard summaries
- list bootstrapping
- lookup/reference panels

Use SSR for:

- auth-sensitive pages
- EDMS detail pages
- task detail and oversight routes
- report views

Use CSR islands for:

- chat
- GIS map
- rich editors
- large interactive grids
- drag/drop boards

### 12.2 Code Splitting

- route-group splits by domain
- dynamic import GIS subsystem
- dynamic import charting and rich-text packages
- isolate admin editors from general user bundles

### 12.3 Virtualization

Required for:

- document lists
- task grids
- chat message lists
- notification inbox
- audit logs
- layer trees where large

### 12.4 Caching

- React Query for browser server-state cache
- request memoization and route-level preload for server renders
- private/no-store for sensitive BFF endpoints
- carefully scoped stale times based on domain volatility

### 12.5 Scaling Considerations

- thousands of users is feasible with SSR/RSC if BFF aggregation is disciplined
- avoid dashboard thundering herds by server aggregation and caching non-sensitive summaries
- prevent websocket fan-out storms by selective subscriptions and targeted domain adapters

---

## 13. Offline Strategy

### 13.1 Portal vs Field PWA

The portal is not a full offline-first app.

Portal offline support is limited to:

- graceful reconnect behavior
- local draft buffering for selected low-risk forms if approved
- cached static assets

The Field PWA remains the true offline operational client.

### 13.2 Shared Logic

Shared packages should provide:

- API contracts
- validation schemas
- auth primitives
- shared design tokens
- queue envelope types

### 13.3 Conflict Resolution

Conflict policy:

- status fields: backend authoritative
- append-only comments/reports: merge append
- narrative fields: user-mediated conflict resolution
- task/document transitions: reject stale actions with explicit re-fetch and review

### 13.4 Offline Queue Governance

Offline queue items must include:

- operation type
- entity reference
- actor context
- created timestamp
- retry count
- idempotency key

---

## 14. Developer Experience

### 14.1 Monorepo Tooling

Use **Turborepo**.

Reason:

- the repo is already workspace-oriented
- package-level caching and task orchestration are the main immediate need
- Nx benefits do not currently outweigh setup and governance overhead

### 14.2 Storybook

Storybook is required for:

- design system primitives
- enterprise components
- accessibility review
- visual regression baselines

### 14.3 Testing Strategy

#### Unit and Component

- Vitest
- React Testing Library
- mapper and ACL tests
- feature interaction tests

#### Integration

- MSW-backed BFF contract tests
- route handler tests
- workflow action tests

#### End-to-End

- Playwright
- role-based fixtures
- classification-level fixtures
- realtime scenarios
- GIS loading smoke

### 14.4 Quality Gates

- lint
- typecheck
- unit tests
- critical Playwright smoke
- bundle budget alerts
- accessibility checks on core flows

---

## 15. Implementation Roadmap

## FE-1 Foundation

### Tasks

- create `apps/portal-web` with Next.js App Router
- add Turborepo and shared package scaffolding
- implement session/BFF baseline
- add middleware auth guard
- create shell layout, navigation, and route groups
- add OpenAPI or contract generation pipeline
- establish anti-corruption mapper structure
- migrate login and dashboard

### Dependencies

- backend auth/session endpoints
- deployment support for Next.js
- routing and ingress ownership decision

### Deliverables

- running portal in parallel with legacy Vite apps
- secure session model
- initial shell and dashboard
- baseline CI and testing

## FE-2 Design System

### Tasks

- create `packages/ui` and `packages/ui-enterprise`
- define token scales
- implement core shadcn/Radix primitives
- build enterprise DataGrid, WorkflowTimeline, MapPanel
- configure Storybook
- document accessibility and component usage rules

### Dependencies

- FE-1 package structure
- approved branding and accessibility targets

### Deliverables

- reusable design system
- Storybook
- component documentation
- design token contract

## FE-3 Core Modules

### Tasks

- migrate tasks routes
- migrate EDMS routes
- migrate notifications
- migrate admin registries
- implement workflow UI engine
- implement permission-aware action descriptors across core modules

### Dependencies

- FE-1 BFF and auth
- FE-2 component library
- stable backend contracts for tasks and EDMS

### Deliverables

- core office workflows running in Next.js
- reusable workflow engine
- normalized BFF contracts for primary domains

## FE-4 Realtime + GIS

### Tasks

- implement shared realtime client
- migrate chat UI
- integrate presence and typing
- absorb GIS subsystem into portal
- implement layer tree, incident inspector, risk overlay panels
- connect websocket events to task, EDMS, chat, GIS caches

### Dependencies

- gateway event contracts
- GIS service endpoints
- FE-2 MapPanel and enterprise components

### Deliverables

- realtime-enabled portal
- integrated chat
- portal-based GIS for office users

## FE-5 Analytics + ML

### Tasks

- build executive and operational dashboards
- implement report center and exports
- add ML insight review UI
- connect GIS overlays to analytical drill-down
- optimize large analytical data views

### Dependencies

- analytics APIs
- ML prediction APIs
- export service readiness

### Deliverables

- analyst and executive dashboards
- governed reporting
- ML-assisted operational intelligence views

## FE-6 Hardening

### Tasks

- security review and data leakage audit
- performance budget enforcement
- accessibility certification pass
- resilience testing for websocket and degraded backends
- legacy Vite retirement
- standalone office GIS retirement
- operational runbooks and support documentation

### Dependencies

- all core domains migrated
- UAT and security feedback
- observability and frontend telemetry in place

### Deliverables

- production-hardened portal
- decommissioned legacy office frontends
- readiness for government deployment and audit

---

## 16. Risks & Trade-offs

### 16.1 Migration Risks

| Risk | Impact | Mitigation |
|---|---|---|
| Dual runtime complexity | inconsistent behavior during migration | route ownership registry and early auth centralization |
| Team split across legacy and new app | slower delivery | freeze migrated-domain features in legacy app |
| GIS migration timing | performance regression | move GIS only after shell/BFF patterns stabilize |

### 16.2 Performance Risks

| Risk | Impact | Mitigation |
|---|---|---|
| oversized client bundles | slow first load | dynamic imports and route-level splitting |
| map-heavy pages degrading shell | poor UX | isolate GIS runtime and avoid shared hydration cost |
| large lists without virtualization | browser instability | virtualization by default for operational grids |

### 16.3 Security Risks

| Risk | Impact | Mitigation |
|---|---|---|
| client token persistence | account compromise and replay | server-side session model only |
| overfetch then hide | classification leak | BFF redaction before client delivery |
| signed file URL leakage | sensitive file exposure | BFF streaming for high-sensitivity content |

### 16.4 Organizational Risks

| Risk | Impact | Mitigation |
|---|---|---|
| insufficient contract discipline | frontend-backend drift | generated contracts plus ACL mapping ownership |
| delayed design system maturity | inconsistent UI and slow module delivery | FE-2 treated as core, not optional |
| unclear ownership between domains | duplicated logic | strict layer and package boundaries |

### 16.5 Intentional Trade-offs

- The portal is centralized rather than micro-frontend-based to optimize control, security, and maintainability.
- The Field PWA remains separate to preserve offline resilience rather than forcing a single deployment ideology.
- The GIS subsystem is integrated into the portal for office users but kept internally isolated because it has different runtime characteristics.

This trade-off set minimizes current delivery risk while preserving a path to future extraction if operational scale later justifies it.
