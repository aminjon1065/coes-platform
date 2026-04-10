# Tasks Backlog

Priority: `P0`

## Current Assessment
- Large operational domain with relatively thin test coverage for its size.
- Highest probability of remaining access-control and state-machine asymmetry bugs.

## P0
- Review access symmetry across read, write, verify, reassign, delete, attachment, and comment paths.
- Centralize task visibility and mutation guards.
- Hardening of task lifecycle transitions with one authoritative transition guard.
- Reassignment integrity: preserve history, authority validation, and visibility.
- Separate executor completion from supervisor verification cleanly.
- Fix parent/subtask propagation rules for cancelled, blocked, returned, and completed children.
- Add regression tests for outsider, ex-assignee, supervisor, verifier, and propagation scenarios.

## P1
- Event consistency review for task channel, overdue, and status-changed emissions.
- Concurrency checks for duplicate reassignment and duplicate completion flows.

## Exit Criteria
- Uniform ACL helpers used by all sensitive paths.
- State machine logic no longer duplicated across methods.
- Expanded spec coverage for authority, lifecycle, and propagation paths.
