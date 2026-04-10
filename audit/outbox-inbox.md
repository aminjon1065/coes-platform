# Module: Outbox & Inbox (Transactional Messaging)

## Overview
Implements the Transactional Outbox and Inbox patterns for reliable cross-domain event delivery. Outbox persists events in the same transaction as the business operation, then a background dispatcher delivers them. Inbox ensures idempotent consumption — duplicate events from any transport are deduplicated by hash.

---

## Current Issues (Outbox)

- ❌ **Dispatch order not guaranteed** — The cron dispatcher queries pending events without ordering by `createdAt` ascending. Events from the same aggregate can be dispatched out of order, causing downstream consumers to see state reversals (e.g., `task.completed` before `task.assigned`).
- ❌ **Completed events never deleted** — Events with `status = 'completed'` accumulate forever. The outbox table will grow unboundedly, degrading cron query performance.
- ❌ **No event payload size limit** — Large JSON payloads (e.g., full document content) are stored in the event body. This bloats the outbox table and can cause serialization timeouts.
- ❌ **Retry without jitter** — Failed events are retried every 15 seconds uniformly. Under a downstream outage, all 10 retries fire at the same cadence, creating thundering-herd behavior when the downstream recovers.

---

## Current Issues (Inbox)

- ❌ **SHA-256 hash collision not handled** — Two different payloads that hash to the same value (theoretically possible, practically rare) would cause the second event to be silently dropped as a duplicate.
- ❌ **Stale `processing` records cause permanent skip** — If a consumer crashes mid-processing, the inbox record stays in `processing` status. On restart, it's treated as "already processing" and skipped indefinitely. There is no staleness recovery.
- ❌ **Single consumer per event type** — No parallel consumption; a slow handler blocks all subsequent events of that type from the same inbox consumer.

---

## Missing Functionality

- 🚫 **Outbox event retention / archival** — TTL-based cleanup of completed events (keep 30 days, then purge or archive to cold storage).
- 🚫 **Dead letter monitoring** — No alerting when events reach `dead_letter` status. Operators have no visibility into permanently failed events.
- 🚫 **Dispatch ordering guarantee** — `ORDER BY created_at ASC, id ASC` must be enforced in the dispatcher query.
- 🚫 **Inbox stale processing recovery** — Cron job to reset `processing` records older than a configurable timeout (e.g., 5 minutes) back to `pending`.
- 🚫 **Payload size guard** — Reject or truncate payloads exceeding a configured limit (e.g., 64 KB) in `OutboxService.publish()`.

---

## Technical Debt

- 🧱 **15-second fixed cron interval is too coarse for critical events** — A resolution issuing a task assignment should be propagated in milliseconds, not up to 15 seconds. The outbox should support a wake-up mechanism (Redis Pub/Sub ping) to trigger immediate dispatch on new event insertion.
- 🧱 **Outbox and actual business transaction not explicitly co-located** — Callers call `outboxService.publish()` after the main `repo.save()`. If the process crashes between the two, the event is lost. Both operations must be in the same `DataSource.transaction()` block.
- 🧱 **`aggregateType` and `aggregateId` are optional strings** — No enforcement of known aggregate types. A typo in `aggregateType: 'documnet'` causes silent miscategorization.

---

## Risks

- 🔓 **Lost events on crash between save and publish** — If `outboxService.publish()` is called outside the business transaction, a crash after `save()` but before `publish()` silently drops the event.
- 🔓 **Dead-lettered events invisible to operators** — Business-critical events (resolution assignments, task escalations) could be permanently lost with no alerting.
- 🔓 **Out-of-order delivery causing data corruption** — A task `returned` event arriving before `completed` in the EDMS sync listener could set an incorrect document state.

---

## Recommendations

- ✅ **Enforce transactional co-location pattern:**
  ```typescript
  // Callers must pass the EntityManager from their existing transaction
  await outboxService.publish(eventType, payload, opts, manager); // manager is required
  ```
- ✅ **Add `ORDER BY created_at ASC, id ASC` to dispatcher query** and process events per-aggregate serially.
- ✅ **Implement Redis wake-up for outbox:**
  ```typescript
  // After inserting outbox event:
  await redis.publish('outbox:new', aggregateType);
  // Dispatcher subscribes and triggers immediate dispatch attempt
  ```
- ✅ **Add retention cleanup cron:**
  ```typescript
  @Cron('0 3 * * *') // 3 AM daily
  async cleanupCompletedEvents() {
    await this.outboxRepo.delete({
      status: 'completed',
      updatedAt: LessThan(subDays(new Date(), 30)),
    });
  }
  ```
- ✅ **Add stale inbox recovery:**
  ```typescript
  @Cron('*/5 * * * *')
  async recoverStaleInboxRecords() {
    await this.inboxRepo.update(
      { status: 'processing', updatedAt: LessThan(subMinutes(new Date(), 5)) },
      { status: 'pending' },
    );
  }
  ```
- ✅ **Alert on dead-lettered events** — Emit a `system.dead_letter_event` notification to the admin channel when an event transitions to `dead_letter`.
