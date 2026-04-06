# ADR-001: Modular Monolith with Three Extracted Services

**Date:** 2026-01-15
**Status:** Accepted
**Deciders:** Platform Architecture Team

---

## Context

CoESCD requires a government-grade emergency management platform deployed on sovereign on-premises hardware in Tajikistan. The system must support 10+ functional domains (IAM, EDMS, Tasks, Chat, GIS, Analytics, ML, etc.) while operating in a constrained environment with:

- Limited DevOps staffing (2–3 engineers)
- No cloud provider — single data centre
- Strict latency requirements for real-time coordination (WebSocket, SFU calls)
- Regulatory requirement for sovereign data residency

The primary architectural question was: **microservices or modular monolith?**

## Decision

We adopt a **NestJS modular monolith** for the core backend, with exactly three services extracted into separate processes where technical constraints require it:

| Extracted Service | Reason for Extraction |
|---|---|
| `apps/gateway` | WebSocket fan-out at scale; avoids sharing event loop with HTTP handlers |
| `apps/media` | MediaSoup SFU requires host networking and UDP port binding; cannot share a process with the HTTP server |
| `apps/pipelines` | Airflow requires Python runtime; cannot be embedded in Node.js |

All other domains (IAM, Org, Users, EDMS, Tasks, Chat, Notifications, Files, Search, GIS, Analytics, ML, Reporting, Audit, Authorization) run as NestJS modules within a single process.

## Rationale

**Why not full microservices?**

- Distributed tracing, schema coordination, and network hop overhead require mature platform engineering; the team is too small to sustain this.
- Transactions spanning two services (e.g., EDMS + Tasks cross-domain) require either 2-phase commit or eventual consistency with compensation logic — both add significant complexity without proportional benefit at CoESCD's scale (hundreds, not millions, of concurrent users).
- A monolith that fails fails loudly and completely; cascading partial failure in microservices is harder to diagnose in a crisis operations context.

**Why not a pure monolith?**

- MediaSoup needs `hostNetwork: true` in Kubernetes and uses worker processes that fork. Running it inside the main NestJS process would make the entire platform dependent on media-layer stability.
- The Airflow pipeline scheduler is Python-native and benefits from independent scaling during bulk spatial ingestion windows.
- The WebSocket gateway handling 5,000+ concurrent connections benefits from a dedicated event loop with a lighter footprint than the full backend module set.

**Module isolation discipline**

Within the monolith, every domain module:
- Communicates with other domains only through `EventEmitter2` events (no direct service injection across module boundaries, except `@Global()` services like `AuditService` and `AuthorizationService`).
- Owns its own schema in PostgreSQL (`iam`, `org`, `edms`, `tasks`, `chat`, `notifications`, `files`, `gis`, `analytics`, `audit`, `authz`, `ml`, `reporting`).
- Has no circular dependencies enforced by the module graph.

This allows future extraction of any module into its own service if load requires it, without re-architecting the data model.

## Consequences

- **Positive:** Simple deployment (one Docker image, one container, one process to monitor). Easy local development (`docker compose up --profile app`). Straightforward distributed tracing (single service in Jaeger).
- **Positive:** Cross-module transactions use standard TypeORM transaction managers with no 2PC.
- **Negative:** A bug in one module can crash all modules. Mitigated by `class-validator` input guards, exception filters, and the fact that NestJS isolates exceptions per request.
- **Negative:** Module-level scaling is impossible — the entire backend scales horizontally (HPA: 2–8 replicas). Acceptable given the projected user base.
