# Module: Audit

## Overview
Provides an immutable, tamper-evident audit trail for all significant platform operations. Events are stored in `AuditEvent` with SHA-256 integrity hash, severity levels, actor/resource metadata, and a separate `AuditArchive` table for long-term retention.

---

## Current Issues

- ❌ **Integrity hash computed client-side only** — `SHA-256(nonce + eventType + actorId + timestamp)` is computed in application code before insert. There is no server-side or DB-side verification on read. A compromised database admin can alter both the record and the hash field without detection.
- ❌ **`AuditService.emit()` failures are silent** — The service is designed to "never break the primary operation." Errors are swallowed and only logged. If the audit table is full, the DB connection pool is exhausted, or the write fails for any reason, the primary operation continues and the audit gap is invisible.
- ❌ **`occurred_at` is set by application code** — A malicious actor with DB write access can back-date audit events. `occurred_at` should be `DEFAULT now()` in the DB with no application override.
- ❌ **No SIEM export implementation** — `SiemExportService` stub exists but no implementation. Compliance requirements for government systems typically mandate export to centralized log management.
- ❌ **Incomplete coverage** — Document body updates, task edits, file permission grants, user preference changes, and admin operations lack audit events.

---

## Missing Functionality

- 🚫 **Hash chain (linked-list integrity)** — Each event should include the hash of the previous event (`previousHash`), forming a blockchain-style chain. Tampering with any event breaks all subsequent hashes.
- 🚫 **Server-side hash verification job** — Cron job that re-computes and validates hashes for recent events to detect tampering.
- 🚫 **SIEM/Syslog export** — Integration with external SIEM (via RFC 5424 syslog or HTTPS webhook) for centralized security monitoring.
- 🚫 **Automated retention enforcement** — No job that moves events older than the configured retention period to `AuditArchive` or deletes them per policy.
- 🚫 **Audit search API** — No endpoint to query audit events by actor, resource, date range, severity. Compliance officers have no self-service tool.
- 🚫 **Alert on suspicious patterns** — No rule engine to flag abnormal audit activity (e.g., >50 document accesses in 1 minute by one user).

---

## Technical Debt

- 🧱 **`AuditService` called from services directly** — Every service has `this.auditService.emit(...)` spread throughout. This couples audit logic to business logic. Consider an AOP approach (custom interceptor or decorator) for standard CRUD events.
- 🧱 **Event type is a raw string** — `eventType: 'EDMS_RESOLUTION_ISSUED'` is not type-checked. A typo creates a novel event type silently. Should be a string enum `AuditEventType`.
- 🧱 **No pagination on audit query** — If a compliance officer queries all audit events for a resource, they could retrieve millions of rows.

---

## Risks

- 🔓 **Non-verifiable audit trail** — Client-side hash computation means the audit trail cannot be used as evidence in legal proceedings — a sophisticated attacker can modify both data and hash.
- 🔓 **Silent audit gaps** — The swallow-and-log error strategy means compliance audits may miss critical events without anyone being alerted.
- 🔓 **Unbounded table growth** — Without automated archival, the `audit_events` table degrades query performance over months.

---

## Recommendations

- ✅ **Implement hash chain:**
  ```typescript
  const lastEvent = await this.auditRepo.findOne({ order: { id: 'DESC' } });
  const previousHash = lastEvent?.hash ?? '0'.repeat(64);
  const hash = sha256(`${previousHash}${nonce}${eventType}${actorId}${issuedAt}`);
  ```
- ✅ **Force `occurred_at` in DB:** Remove `occurred_at` from insert payload; add `DEFAULT now()` to column definition with `update: false`.
- ✅ **Define `AuditEventType` enum** with all known event type strings. Use `@IsEnum(AuditEventType)` in the emit DTO.
- ✅ **Add pagination to audit query endpoint** — `GET /audit/events?resourceId=X&page=1&limit=50`.
- ✅ **Add audit verification cron:**
  ```typescript
  @Cron('0 2 * * *')
  async verifyRecentHashes() {
    const events = await this.auditRepo.find({ order: { id: 'ASC' }, take: 10000 });
    let prev = '0'.repeat(64);
    for (const event of events) {
      const expected = sha256(`${prev}${event.nonce}${event.eventType}...`);
      if (expected !== event.hash) await this.alertIntegrityViolation(event);
      prev = event.hash;
    }
  }
  ```
- ✅ **Emit `system.audit_write_failed` notification** to admin channel when `AuditService.emit()` throws, instead of swallowing silently.
