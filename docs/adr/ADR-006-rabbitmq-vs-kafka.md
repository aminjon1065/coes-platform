# ADR-006: RabbitMQ over Kafka for Event Bus

**Date:** 2026-01-22
**Status:** Accepted
**Deciders:** Platform Architecture Team

---

## Context

The platform uses asynchronous event-driven communication for:
- Cross-domain domain events (e.g., `edms.resolution.issued` → Tasks module creates a follow-up task)
- Notification dispatch (email, SMS, push) decoupled from the event producer
- Audit event pipeline
- ML inference result delivery from Airflow to the backend

The choice of message broker determines operational complexity, consumer semantics, and failure modes.

## Decision

**RabbitMQ 3.12** (AMQP 0-9-1) over Apache Kafka.

## Rationale

**Volume does not justify Kafka:**

Kafka is optimised for high-throughput sequential log processing (millions of messages/second). CoESCD's peak event volume is estimated at a few thousand messages per minute during a major incident — several orders of magnitude below Kafka's sweet spot.

Kafka's operational model (ZooKeeper/KRaft cluster, partition replication, consumer group offset management, compacted topics) requires dedicated Kafka expertise that the 2-person ops team does not have.

**RabbitMQ strengths for our patterns:**

| Pattern | RabbitMQ | Kafka |
|---|---|---|
| Work queues (notification dispatch) | Native, mature | Requires consumer group coordination |
| Routing by event type | Topic exchanges + routing keys | Requires topic-per-event-type or filtering |
| Dead letter queues | Built-in DLX/DLQ | Requires external tooling |
| Per-message TTL | Yes | No (partition-level only) |
| Single-node ops | Yes | Requires 3-node minimum for HA |

**Event sourcing is not a requirement:**

We do not need event replay or event sourcing (the audit log in PostgreSQL serves the compliance record). RabbitMQ's message acknowledgment model (at-most-once or at-least-once per consumer) is sufficient.

**NestJS integration:**

`@nestjs/microservices` has a built-in RabbitMQ transporter. The internal event bus (`EventEmitter2`) handles synchronous in-process events; RabbitMQ handles async cross-process events (e.g., from Airflow pipelines to the backend). This two-tier model avoids coupling the NestJS process to a broker for intra-module communication.

**Kubernetes peer discovery:**

RabbitMQ's `rabbit_peer_discovery_k8s` plugin provides automatic cluster formation using the Kubernetes Endpoints API. The Helm chart configures a headless service for peer discovery and a stable client service for application connections. Erlang cookie stored as a K8s Secret with `helm.sh/resource-policy: keep` to prevent cookie regeneration on upgrades.

## Alternatives Considered

**Redis Streams:** Suitable for simpler use cases. Lacks dead letter queues and routing exchanges. Already used for caching and pub/sub — adding a streams workload to the same Redis instance is a reliability anti-pattern.

**NATS:** Faster than RabbitMQ but lacks durable queues by default (requires JetStream). Less mature NestJS integration.

**In-process EventEmitter2 only:** Works for the monolith but breaks down for cross-process communication (Airflow → backend, media service → backend). A broker is required.

## Consequences

- Consumers must implement idempotency for at-least-once delivery (e.g., notification dispatch checks if notification already delivered before sending).
- RabbitMQ Management UI is exposed on port 15672 under the `infra` Docker Compose profile and behind nginx auth in production.
- Dead letter queue monitoring is included in the Prometheus alert rules (`RabbitMQDeadLetterQueueGrowing`).
