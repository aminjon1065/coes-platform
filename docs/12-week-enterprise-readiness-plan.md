# CoESCD Platform — 12-Week Enterprise Readiness Plan

> **Platform:** CoESCD Unified Digital Platform
> **Purpose:** Close the gap between declared completion in `plan.md` and actual enterprise-ready delivery
> **Type:** Engineering execution plan (stabilization, hardening, rollout readiness)
> **Timeline:** 12 weeks
> **Baseline Date:** 2026-04-07
> **Primary Input:** `plan.md` + current repository state

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

## Objective

This plan does **not** add major new business scope. Its purpose is to make the scope already claimed in `plan.md` operationally true:

1. All applications build reliably.
2. Core backend domains pass tests and smoke flows.
3. Stub integrations are replaced or explicitly downgraded in status.
4. CI/CD, security, observability, DR, and release processes meet enterprise expectations.
5. The platform is ready for controlled pilot rollout and production sign-off.

---

## Week 12 Exit Criteria

The 12-week plan is considered complete only if all of the following are true:

- `apps/backend`, `apps/gateway`, `apps/media`, `apps/web`, `apps/map-client`, and `apps/field-pwa` all build successfully in CI.
- Backend unit/integration test suites are green with enforced coverage thresholds for critical modules.
- Event-driven smoke flows are automated:
  - EDMS Resolution -> Task -> Notification -> Realtime
  - Incident Report -> GIS -> Analytics -> Alert
  - Task Discussion -> File Upload -> Audit
- Stub-only integrations are either productionized or explicitly marked partial in `plan.md`.
- Backup/restore, failover, and rollback procedures are tested and documented.
- Security baseline is active: secrets management, image/dependency scanning, SBOM, audit review workflow, access review, and incident response runbooks.
- Pilot environment, release checklist, rollback checklist, and operator runbooks are approved.

---

## Scope Boundaries

### In Scope

- Repository stabilization
- Build/test/CI repair
- Domain hardening
- Search, files, notifications, GIS, media productionization
- Security and SRE hardening
- Pilot rollout readiness

### Out of Scope

- New large product domains beyond the current `plan.md`
- Major UX redesign beyond production readiness improvements
- Full nationwide production rollout beyond pilot readiness

---

## Week 1-2: Truth Alignment & Repository Stabilization
**Target:** Establish a truthful baseline and restore deterministic engineering workflow

### 1.1 Repository & Tooling Baseline
| # | Task | Status | Notes |
|---|------|--------|-------|
| 1.1.1 | Freeze net-new feature work for stabilization window | ⏳ | No new scope merged until build/test baseline is restored |
| 1.1.2 | Standardize package manager strategy (npm-only or pnpm+turbo) | ⏳ | Current repo mixes `npm`, missing `package-lock.json`, and `bun.lock` |
| 1.1.3 | Fix root workspace definitions and scripts | ⏳ | Root `package.json` must include all maintained apps and remove invalid workspace entries |
| 1.1.4 | Normalize lockfiles and installation flow for local + CI | ⏳ | One installation path only; no hidden per-app drift |
| 1.1.5 | Create single repo bootstrap command | ⏳ | Fresh checkout -> install -> build -> test -> smoke |

### 1.2 Build Recovery
| # | Task | Status | Notes |
|---|------|--------|-------|
| 1.2.1 | Restore green backend build | ⏳ | Fix current compile errors in audit and analytics modules |
| 1.2.2 | Restore green gateway test tooling | ⏳ | `jest` script exists; tooling is incomplete |
| 1.2.3 | Restore green media build | ⏳ | Fix mediasoup codec typing and compatibility |
| 1.2.4 | Restore green map-client build | ⏳ | Remove TS errors and unused imports/types |
| 1.2.5 | Restore green field-pwa build | ⏳ | Fix `import.meta`, PWA typing, and React import issues |
| 1.2.6 | Add repository-wide `build:all` and `check:all` scripts | ⏳ | Must become the default pre-merge verification path |

### 1.3 Plan / Status Reconciliation
| # | Task | Status | Notes |
|---|------|--------|-------|
| 1.3.1 | Audit every `✅` item in `plan.md` against code + build + tests | ⏳ | Create a truth matrix: confirmed / partial / unverified |
| 1.3.2 | Downgrade overstated statuses in `plan.md` | ⏳ | Especially stub integrations and non-building apps |
| 1.3.3 | Add evidence-based completion rule to `plan.md` | ⏳ | A task cannot be `✅` without code + verification artifact |
| 1.3.4 | Define ownership per subsystem | ⏳ | Backend, realtime, media, web, GIS/PWA, infra, QA |

### Exit Criteria

- Clean install works from a fresh checkout.
- All apps either build successfully or have a tracked blocking issue with owner and ETA.
- `plan.md` statuses are reconciled with reality.

---

## Week 3-4: Quality Gates, Test Harness & Contracts
**Target:** Make correctness enforceable, not aspirational

### 2.1 Test Infrastructure
| # | Task | Status | Notes |
|---|------|--------|-------|
| 2.1.1 | Fix backend Jest typings and test environment | ⏳ | Add missing dev dependencies and test TS config |
| 2.1.2 | Split backend tests into unit / integration / smoke layers | ⏳ | Current suite is broad but operationally fragile |
| 2.1.3 | Add gateway unit and websocket integration test pipeline | ⏳ | Authentication, room fan-out, disconnect, presence |
| 2.1.4 | Add media service tests for signaling/session lifecycle | ⏳ | Join, produce, consume, end-session, cleanup |
| 2.1.5 | Add frontend build-validation and route smoke tests | ⏳ | Web, map-client, field-pwa |

### 2.2 CI/CD Hardening
| # | Task | Status | Notes |
|---|------|--------|-------|
| 2.2.1 | Repair CI dependency cache and lockfile references | ⏳ | Existing workflows reference missing `package-lock.json` files |
| 2.2.2 | Add mandatory build/test/lint gates per app | ⏳ | No image build or deploy without green gates |
| 2.2.3 | Add backend migration check step | ⏳ | Verify migrations apply on empty database |
| 2.2.4 | Add Docker image build validation for backend/gateway/media | ⏳ | Build images in CI before registry push |
| 2.2.5 | Add artifact retention and release metadata | ⏳ | Store version, SHA, build time, and environment metadata |

### 2.3 Contracts & Shared Standards
| # | Task | Status | Notes |
|---|------|--------|-------|
| 2.3.1 | Define event schema registry for RabbitMQ topics | ⏳ | Versioned payload contracts for EDMS, tasks, chat, GIS, ML |
| 2.3.2 | Introduce shared DTO/type package | ⏳ | Avoid drift across backend, web, map-client, gateway, PWA |
| 2.3.3 | Standardize correlation ID and idempotency semantics | ⏳ | All cross-domain workflows must be replay-safe |
| 2.3.4 | Define error-code catalog for clients | ⏳ | UI should not parse free-form backend messages |

### Exit Criteria

- CI is deterministic and blocks broken merges.
- Test tooling is fixed and runnable in local + CI environments.
- Shared event/API contract rules are documented and enforced.

---

## Week 5-6: Close Stub Integrations & Productionize Incomplete Domains
**Target:** Eliminate the highest-risk gap between claimed and actual functionality

### 3.1 Search Infrastructure Completion
| # | Task | Status | Notes |
|---|------|--------|-------|
| 3.1.1 | Complete document indexing from EDMS events | ⏳ | Replace listener stub with repository-backed indexing |
| 3.1.2 | Complete task indexing from task events | ⏳ | Index create/update/status changes with full search document |
| 3.1.3 | Add reindex command for backfill/recovery | ⏳ | Required after mapping changes or data repair |
| 3.1.4 | Add OpenSearch health and index drift checks | ⏳ | Detect stale or partial indexing early |

### 3.2 File Security Completion
| # | Task | Status | Notes |
|---|------|--------|-------|
| 3.2.1 | Replace ClamAV stub with real malware scanning integration | ⏳ | Streaming scan path from MinIO object source |
| 3.2.2 | Add quarantine / infected-file workflow | ⏳ | Prevent presigned URL generation for suspect files |
| 3.2.3 | Add file retention / legal hold policy enforcement | ⏳ | Enterprise governance requirement |
| 3.2.4 | Add audit evidence for all file access paths | ⏳ | Read, download, share, quarantine, delete |

### 3.3 Notification Productionization
| # | Task | Status | Notes |
|---|------|--------|-------|
| 3.3.1 | Replace email provider stub with SMTP/Nodemailer adapter | ⏳ | Environment-driven transport with retries |
| 3.3.2 | Replace SMS provider stub with real gateway adapter | ⏳ | Priority-aware delivery and provider error mapping |
| 3.3.3 | Implement verified email/phone resolution path | ⏳ | Pull from IAM/users instead of returning null |
| 3.3.4 | Implement push subscription backend endpoints end-to-end | ⏳ | Field PWA flow must be fully wired |

### 3.4 GIS / Analytics Completion
| # | Task | Status | Notes |
|---|------|--------|-------|
| 3.4.1 | Replace GIS incident enrichment placeholder with real spatial enrichment | ⏳ | Elevation, nearby assets, region context, optional async jobs |
| 3.4.2 | Add pipeline-to-backend delivery validation | ⏳ | Airflow jobs must emit measurable success/failure outcomes |
| 3.4.3 | Validate analytics and GIS cron jobs against real seed data | ⏳ | No “done” status without executed jobs |

### Exit Criteria

- Search, files, notifications, and GIS no longer rely on stub-only critical paths.
- All previously overstated `✅` integrations are either real or explicitly marked partial.

---

## Week 7-8: Core Domain Hardening & End-to-End Reliability
**Target:** Make the most important workflows replay-safe, auditable, and supportable

### 4.1 Backend Consistency & Resilience
| # | Task | Status | Notes |
|---|------|--------|-------|
| 4.1.1 | Introduce outbox pattern for critical cross-domain events | ⏳ | EDMS, tasks, notifications, chat, analytics |
| 4.1.2 | Add inbox/idempotency handling for event consumers | ⏳ | Prevent duplicate side effects on retries |
| 4.1.3 | Review transactional boundaries in EDMS/tasks/files | ⏳ | Ensure DB commit and event emission remain consistent |
| 4.1.4 | Add dead-letter and retry policy per message class | ⏳ | Business vs infrastructure failures handled differently |

### 4.2 End-to-End Smoke Flows
| # | Task | Status | Notes |
|---|------|--------|-------|
| 4.2.1 | Automate EDMS Resolution -> Task -> Notification -> Realtime smoke flow | ⏳ | Required pilot readiness scenario |
| 4.2.2 | Automate Incident -> GIS -> Analytics -> Alert smoke flow | ⏳ | Validate emergency operations path |
| 4.2.3 | Automate Task Discussion -> File -> Audit smoke flow | ⏳ | Validate cross-domain audit chain |
| 4.2.4 | Add nightly smoke run in staging | ⏳ | Detect regression outside unit-level coverage |

### 4.3 Media / Realtime Hardening
| # | Task | Status | Notes |
|---|------|--------|-------|
| 4.3.1 | Validate media session lifecycle under reconnect and multi-user load | ⏳ | Join/leave/rejoin/end cleanup must be reliable |
| 4.3.2 | Add gateway presence and room consistency recovery | ⏳ | Handle Redis/Rabbit reconnect and partial disconnects |
| 4.3.3 | Add call teardown and orphan-resource cleanup jobs | ⏳ | Prevent leaked sessions/transports/consumers |

### Exit Criteria

- Core business workflows are automated and reproducible.
- Event-driven reliability is no longer dependent on best-effort listeners only.
- Realtime and media services are stable enough for controlled pilot use.

---

## Week 9-10: Security, SRE & Disaster Recovery
**Target:** Reach minimum acceptable enterprise operational posture

### 5.1 Security Baseline
| # | Task | Status | Notes |
|---|------|--------|-------|
| 5.1.1 | Move all secrets to managed environment strategy | ⏳ | No long-lived secrets embedded in local files for production |
| 5.1.2 | Add dependency scanning and image scanning in CI | ⏳ | SAST + container scans + CVE policy |
| 5.1.3 | Generate SBOM for deployable artifacts | ⏳ | Required for enterprise supply-chain visibility |
| 5.1.4 | Add secret rotation playbook and key versioning | ⏳ | JWT, DB, Redis, RabbitMQ, MinIO, SMTP, SMS |
| 5.1.5 | Conduct access review for admin/service accounts | ⏳ | Least privilege and break-glass separation |

### 5.2 Observability & SRE
| # | Task | Status | Notes |
|---|------|--------|-------|
| 5.2.1 | Define SLI/SLO per critical subsystem | ⏳ | API, auth, search, notifications, media, GIS, pipelines |
| 5.2.2 | Add synthetic health checks for external-facing flows | ⏳ | Health endpoint alone is insufficient |
| 5.2.3 | Finalize dashboards and alert routing ownership | ⏳ | Every alert must have an owner and runbook |
| 5.2.4 | Add log correlation across backend/gateway/media/pipelines | ⏳ | Correlation ID visible in logs and traces |
| 5.2.5 | Add performance baseline and load-test profiles | ⏳ | Login, search, task listing, incident reporting, websocket fan-out |

### 5.3 Backup, Restore & DR
| # | Task | Status | Notes |
|---|------|--------|-------|
| 5.3.1 | Execute full Postgres restore drill from backup artifact | ⏳ | Measure actual RPO/RTO |
| 5.3.2 | Test MinIO object recovery and index rebuild flow | ⏳ | Include files + search recovery |
| 5.3.3 | Validate Redis/Rabbit recovery procedures | ⏳ | Presence and event flow recovery behavior |
| 5.3.4 | Write disaster recovery runbook | ⏳ | Step-by-step failover and restore instructions |

### Exit Criteria

- Security baseline controls are active in CI/CD and runtime.
- DR procedures are tested, not theoretical.
- Observability is tied to operational ownership and response playbooks.

---

## Week 11-12: Pilot Readiness, Release Governance & Sign-off
**Target:** Convert a technically stabilized platform into a deployable enterprise release candidate

### 6.1 Environment & Release Management
| # | Task | Status | Notes |
|---|------|--------|-------|
| 6.1.1 | Finalize environment promotion model (dev -> staging -> pilot -> prod) | ⏳ | Config, data, secrets, and approval boundaries |
| 6.1.2 | Add release checklist and rollback checklist | ⏳ | Must be mandatory for every deployment |
| 6.1.3 | Version all deployable services and publish release notes | ⏳ | Backend, gateway, media, web, map-client, PWA |
| 6.1.4 | Validate helm-based staged deployment with rollback | ⏳ | Dry run + actual staging rehearsal |

### 6.2 UAT & Operational Readiness
| # | Task | Status | Notes |
|---|------|--------|-------|
| 6.2.1 | Run structured UAT for admin, EDMS, tasks, GIS, field operator flows | ⏳ | Sign-off by business owners and operators |
| 6.2.2 | Prepare operator runbooks | ⏳ | Deployment, incident response, restore, alert handling |
| 6.2.3 | Prepare support model (L1/L2/L3 ownership) | ⏳ | Escalation map per subsystem |
| 6.2.4 | Prepare training materials for pilot users | ⏳ | Web users, department admins, field operators |

### 6.3 Final Truth Reconciliation
| # | Task | Status | Notes |
|---|------|--------|-------|
| 6.3.1 | Update `plan.md` with evidence-backed final status | ⏳ | No aspirational completion markers |
| 6.3.2 | Publish subsystem readiness report | ⏳ | Build, tests, smoke flows, security, DR, runbooks |
| 6.3.3 | Record known limitations and deferred backlog | ⏳ | Distinguish pilot blockers from post-pilot improvements |
| 6.3.4 | Approve pilot go/no-go decision | ⏳ | Must be explicit and documented |

### Exit Criteria

- Staging/pilot release process is rehearsed and documented.
- UAT is completed for the highest-priority flows.
- The team can support, monitor, rollback, and recover the platform.

---

## Recurring Work Across All 12 Weeks

| # | Task | Status | Notes |
|---|------|--------|-------|
| ∞.1 | Keep `plan.md` status aligned with evidence | 🔁 | Weekly review, not end-of-project cleanup |
| ∞.2 | Weekly architecture / risk review | 🔁 | Track blockers, scope pressure, integration risks |
| ∞.3 | Weekly dependency and CVE review | 🔁 | Patch critical vulnerabilities immediately |
| ∞.4 | Weekly staging smoke run | 🔁 | Core flows must stay executable |
| ∞.5 | Weekly backup verification | 🔁 | At least one restore-related validation every week |
| ∞.6 | Weekly release readiness review | 🔁 | Build health, test health, infra health, on-call health |

---

## Suggested Ownership Model

| Workstream | Primary Owner | Support |
|-----------|---------------|---------|
| Repo / CI / Build | Tech Lead + DevOps | All app owners |
| Core Backend Domains | Backend Team | QA |
| Realtime / Gateway / Media | Backend Realtime Owner | DevOps |
| Web / Map / PWA | Frontend Team | QA |
| Search / Files / Notifications | Backend Platform Owner | DevOps |
| Security / SRE / DR | DevOps / Security Owner | Tech Lead |
| UAT / Pilot Readiness | Product / Operations Owner | QA + Engineering |

---

## Risk Register

| Risk | Impact | Mitigation |
|------|--------|------------|
| Mixed package manager / lockfile strategy remains unresolved | CI instability, non-reproducible builds | Fix in Week 1 before any feature work resumes |
| Stub integrations stay marked as complete | False readiness signal | Downgrade status until productionized |
| Media / GIS / PWA remain unbuilt | Pilot blocked | Treat as critical-path work, not side work |
| Event flows remain best-effort only | Data inconsistency across domains | Outbox/inbox + replay strategy in Week 7-8 |
| DR remains untested | High operational risk | Mandatory restore drill in Week 9-10 |
| `plan.md` diverges again from reality | Planning debt returns | Weekly truth review with evidence links |

---

## Final Deliverables by End of Week 12

1. A reproducible monorepo with deterministic install, build, test, and deploy workflows.
2. A truthful `plan.md` whose completion markers are backed by evidence.
3. Production-grade implementations for currently stubbed critical integrations.
4. Automated smoke coverage for the most important cross-domain flows.
5. Enterprise-ready operational assets: dashboards, alerts, runbooks, DR procedures, release checklist, rollback checklist, support model, and pilot sign-off packet.
