# Inbox Backlog

Priority: `P0`

## Current Assessment
- Foundation module for dedupe and exactly-once-like listener behavior.
- Small code footprint but high correctness impact.

## P0
- Review dedupe key contract for correctness and stability.
- Ensure handler failure does not mark event as processed.
- Verify concurrency safety for duplicate deliveries.
- Define and enforce states for processed, failed, and retryable events.
- Add observability and diagnostic queries for failed/stuck items.
- Add specs for duplicate processing, handler failure, and concurrent consumer races.

## P1
- Add poison-message/dead-letter strategy.
- Add replay and operator tooling.

## Exit Criteria
- `executeOnce` is race-safe and failure-safe.
- Failed and processed states are inspectable and deterministic.
