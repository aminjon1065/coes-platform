# ADR-007: Append-Only Audit Log with Integrity Hashing

**Date:** 2026-01-22
**Status:** Accepted
**Deciders:** Platform Architecture Team, Security Officer, Legal Compliance

---

## Context

Government regulations and legal requirements for the CoESCD platform mandate:
- A tamper-evident record of all security-relevant events (logins, permission grants, document approvals)
- Minimum 7-year retention for audit data
- Non-repudiation: an actor cannot deny having performed an action if it is in the audit log
- Ability to export audit records to an external SIEM (ArcSight, Splunk, QRadar)

The platform handles sensitive operations: declaring states of emergency, issuing government resolutions, managing classified documents. The audit trail must be credible in a court of law.

## Decision

An **append-only PostgreSQL table** (`audit.audit_events`) with:
1. An application-layer integrity hash on each record
2. INSERT-only database permissions (no UPDATE/DELETE allowed from the application role)
3. A two-tier retention model: 90-day hot table → 7-year cold archive
4. CEF/Syslog export for SIEM integration

## Implementation

**Schema (immutable after insert):**
```
id            UUID         (primary key)
actor_id      UUID         (null for system events)
actor_username VARCHAR(100)
event_type    VARCHAR(100) (domain.noun.verb format)
resource_type VARCHAR(100)
resource_id   UUID
ip_address    VARCHAR(45)
user_agent    VARCHAR(512)
success       BOOLEAN
failure_reason VARCHAR(500)
severity      ENUM(info, warning, critical)
metadata      JSONB
integrity_hash VARCHAR(64)  SHA-256
occurred_at   TIMESTAMPTZ  (auto-set by DB)
```

**Integrity hash:**
`SHA-256(nonce + "|" + event_type + "|" + actor_id + "|" + epoch_ms)`

The nonce is a random 16-byte hex string generated at insert time. The hash is stored with the record. External SIEM systems or auditors can re-compute the hash from the stored components and verify it matches, detecting tampering at the row level.

Note: a full Merkle-chain hash (each record hashes the previous record's hash) would provide stronger tamper evidence but requires sequential inserts and prevents parallel event ingestion. The nonce-based approach provides per-record integrity evidence sufficient for the regulatory context.

**Database-level INSERT-only:**
```sql
GRANT SELECT, INSERT ON audit.audit_events TO coescd;
-- No UPDATE, no DELETE
```

Even if the application is compromised, a SQL injection cannot update or delete audit records (only insert forged ones, which would be detectable by the absence of expected real events).

**Two-tier retention:**
- Hot table (`audit_events`): 90-day rolling window, indexed for fast query
- Cold archive (`audit_archives`): 90 days → 7 years, lower-cost storage
- `SiemExportService.archiveOldEvents()` runs daily at 02:30, batch-moves 10,000 records at a time
- `purgeExpiredArchives()` runs monthly on the 1st, hard-deletes records > 7 years

**CEF export:**
All events can be exported as CEF (Common Event Format) lines via `GET /audit/export/cef` or pushed to a remote SIEM via UDP syslog (`POST /audit/export/siem`). This satisfies the requirement for integration with the government's existing SIEM infrastructure.

## Why Not Blockchain/Distributed Ledger?

Blockchain is sometimes proposed for tamper-evident records. The overhead (consensus, node management, smart contracts) is disproportionate for a centralised system where the database server is already trusted infrastructure. Database-level INSERT-only grants + application-layer hashing achieves equivalent tamper evidence for a single-operator deployment at a fraction of the complexity.

## Consequences

- `AuditService.emit()` must never throw — audit failures are logged but do not abort the primary operation. This is intentional: a broken audit pipeline should not prevent an emergency response dispatcher from issuing a task.
- The `integrity_hash` can only be verified if the nonce is also stored. The nonce is embedded in the hash computation input and stored implicitly via `metadata` in complex events. For simple events, the hash serves as a change-detection mechanism (verify stored hash == re-computed hash from fields).
- Because `occurred_at` is set by `@CreateDateColumn` (DB-side `NOW()`), the timestamp cannot be forged by the application layer.
- Audit query performance relies on the three composite indices: `(actor_id, occurred_at)`, `(event_type, occurred_at)`, `(resource_type, resource_id)`. Range queries not using these columns will be slow on large tables — use the `from`/`to` filter parameters.
