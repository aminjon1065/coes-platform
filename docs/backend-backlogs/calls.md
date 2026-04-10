# Calls Backlog

Priority: `P0`

## Current Assessment
- Privacy-heavy domain with limited test depth.
- Session access was already partially hardened, but adjacent paths still need review.

## P0
- Review access symmetry for session list/read/join/leave/end/signaling/recordings.
- Add unified session visibility and mutation guards.
- Block join and signaling for ended sessions.
- Lock down recording read/delete access to authorized actors only.
- Verify controller-to-service actor context propagation everywhere.
- Add specs for outsider access, removed participant behavior, ended-session behavior, and recording privacy.

## P1
- Review idempotency for duplicate join/leave/end flows.
- Review participant lifecycle races.

## Exit Criteria
- All session and recording endpoints use actor-aware guards.
- Ended sessions are immutable from participant perspective.
- Recording access paths have explicit tests.
