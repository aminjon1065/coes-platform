# Architecture Decision Records (ADRs)

This directory contains ADRs for the CoESCD Unified Digital Platform. Each ADR documents a significant architectural choice: the context that forced the decision, the decision made, and the rationale and consequences.

ADRs are **immutable once accepted**. If a decision is superseded, a new ADR is written referencing the old one.

## Index

| ADR | Title | Status |
|-----|-------|--------|
| [ADR-001](ADR-001-modular-monolith.md) | Modular Monolith with Three Extracted Services | Accepted |
| [ADR-002](ADR-002-nestjs-fastify.md) | NestJS 10 with Fastify Adapter | Accepted |
| [ADR-003](ADR-003-typeorm-postgresql.md) | TypeORM 0.3 with PostgreSQL 16 + PostGIS + TimescaleDB | Accepted |
| [ADR-004](ADR-004-four-layer-authorization.md) | Four-Layer Authorization Model (RBAC + Scope + Clearance + Context) | Accepted |
| [ADR-005](ADR-005-refresh-token-rotation.md) | Refresh Token Rotation with Family Tracking | Accepted |
| [ADR-006](ADR-006-rabbitmq-vs-kafka.md) | RabbitMQ over Kafka for Event Bus | Accepted |
| [ADR-007](ADR-007-append-only-audit-log.md) | Append-Only Audit Log with Integrity Hashing | Accepted |
| [ADR-008](ADR-008-mediasoup-sfu.md) | MediaSoup SFU for Real-Time Audio/Video | Accepted |
| [ADR-009](ADR-009-sso-jit-provisioning.md) | SSO with JIT Provisioning over Pre-Provisioned Accounts | Accepted |
| [ADR-010](ADR-010-ml-hitl-risk-forecasting.md) | Human-in-the-Loop (HITL) for ML Risk Forecasting | Accepted |

## Template

```markdown
# ADR-NNN: Title

**Date:** YYYY-MM-DD
**Status:** Proposed | Accepted | Deprecated | Superseded by ADR-NNN
**Deciders:** Team names

---

## Context
What forces are at play? What problem are we solving?

## Decision
The decision that was made.

## Rationale
Why this decision over the alternatives?

## Consequences
What becomes easier? What becomes harder?
```
