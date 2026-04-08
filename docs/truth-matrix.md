# CoESCD Platform — Truth Matrix

> **Purpose:** Separate roadmap intent from current repository-backed verification
> **Baseline Date:** 2026-04-08
> **Scope:** Code, builds, tests, smoke flows, and obvious critical-path stubs visible in the repo

---

## Legend

| Status | Meaning |
|--------|---------|
| Confirmed | Code exists and current verification evidence is green |
| Partial | Code exists, but a critical path still contains a stub, TODO, placeholder, or missing backend wiring |
| Unverified | Code appears present, but the current stabilization cycle did not re-verify the operational path |

---

## Confirmed

| Area | Evidence |
|------|----------|
| Monorepo workspace baseline | Root `npm` workspaces normalized; root `package-lock.json` present; root smoke scripts added |
| Backend build | `npm run build:backend` is green |
| Backend core test baseline | `npm --workspace @coescd/backend run test -- --runInBand` is green (`26/26` suites, `525/525` tests) |
| Gateway test baseline | `npm run test:gateway` is green |
| Media build baseline | `npm run build:media` is green |
| Portal web build baseline | `npm run build:portal` is green; the workspace build path now forces `NODE_ENV=production`, and the secure route group is explicitly dynamic for session-backed rendering |
| Map client build baseline | `npm run build:map` is green |
| Field PWA build baseline | `npm run build:pwa` is green |
| Search document/task indexing | Repository-backed document/task listeners are wired and the search listener smoke suite is green |
| Search recovery/backfill and health | Repository-backed reindex/backfill tooling and OpenSearch health visibility are wired and covered by tests/smoke |
| Event reliability foundation | Outbox persistence/retry/dead-letter and inbox idempotency/retry/reset are wired, surfaced through admin operations, and validated by targeted backend tests across services + listeners |
| Call recording retention cleanup | Expired call recordings are purged from object storage with audit evidence, and the retention cleanup path is covered by targeted tests |
| Virus/malware scanning | File uploads are scanned through a ClamAV TCP `INSTREAM` client, infected files are quarantined and object-storage copies are deleted, and scan failures are fail-closed |
| Email notification delivery | SMTP/Nodemailer transport is wired, recipients resolve from IAM/users data, and delivery outcomes are persisted |
| SMS notification delivery | HTTP gateway transport is wired, phones resolve from IAM/users data, and provider outcomes are persisted; production Helm defaults now leave the adapter disabled |
| Critical notification escalation | Escalation now reuses the real SMS delivery path and resolves active position occupants to IAM credential IDs when the emitting domain omits `recipientUserId` |
| Mobile push notifications | Backend push-subscription persistence/API, VAPID-backed web-push delivery, and the Field PWA custom service worker are wired and verified by build/tests |
| Baseline smoke suite | `npm run smoke:baseline` is green |

---

## Partial

| Area | Why Partial |
|------|-------------|
| GIS incident enrichment | Incident persistence works, but enrichment is still a no-op placeholder |
| Analytics file-report generation | Inline JSON reporting works, but async file-generation remains stubbed |

## Unverified In Current Cycle

| Area | Note |
|------|------|
| On-prem infra operations | Compose/Helm artefacts exist, but restore/failover/live rollout were not re-executed in this repo-only cycle |
| Full K8s runtime behavior | Charts and manifests exist, but cluster-level self-healing was not re-verified in this cycle |
| Full ML operational path | ML/pipeline/reporting code exists, but end-to-end operational verification was not repeated in this cycle |
| Production UAT readiness | Web app builds, but human UAT and operator runbooks are outside repo-only validation |

---

## Current Baseline Commands

```bash
npm run build:backend
npm --workspace @coescd/backend run test -- --runInBand
npm run test:gateway
npm run build:media
npm run build:portal
npm run build:map
npm run build:pwa
npm --workspace @coescd/backend run test -- --runInBand src/modules/outbox/services/outbox.service.spec.ts src/modules/inbox/services/inbox.service.spec.ts src/modules/calls/services/call-recording-retention.service.spec.ts src/modules/tasks/listeners/tasks-edms.listener.spec.ts src/modules/notifications/listeners/notification-domain.listener.spec.ts src/modules/search/listeners/search-indexing.listener.spec.ts src/modules/tasks/services/tasks.service.spec.ts
npm run smoke:baseline
```

---

## Immediate Next Steps

1. Automate the next smoke layer beyond baseline domain slices, starting with cross-domain flows that now depend on outbox/inbox.
2. Extend the outbox/inbox foundation across the remaining critical publishers and tighten transactional boundaries in EDMS/tasks/files.
3. Add file retention/legal-hold and richer audit evidence for file access paths.
4. Add live browser/device validation for the web-push runtime path outside repo-only verification.
