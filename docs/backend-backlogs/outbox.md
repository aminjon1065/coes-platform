# Outbox Backlog

Priority: `P0`

## Current Assessment
- Foundation module for event integrity and eventual delivery.
- Small module, but correctness here affects every cross-domain flow.

## P0
- Verify outbox row creation is transactionally coupled to domain changes.
- Review publish retry behavior and duplicate publish protection.
- Introduce clear delivery states and bounded retry semantics.
- Add detection and handling for poison events.
- Add specs for publish-once behavior, restart safety, and retry safety.

## P1
- Add controlled replay tooling.
- Add aggregate ordering guarantees where required.

## Exit Criteria
- No silent event loss.
- No uncontrolled duplicate publish.
- Failed events are observable and operable.
