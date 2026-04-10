# EDMS Backlog

Priority: `P0`

## Current Assessment
- Large, business-critical domain with the highest number of surfaced production gaps so far.
- Core workflows exist, but consistency across services and listeners must keep being tightened.

## P0
- Finish review of remaining write and archive/retention paths.
- Remove duplicated completion/state logic across workflow, resolution, and task-sync paths.
- Verify all document, resolution, assignment, attachment, version, and workflow reads use the same visibility model.
- Expand tests for retention, archive review, verification, and cross-domain side effects.

## P1
- Improve listener and event coverage around EDMS-task sync.
- Tighten archive/review and document history operational tooling.

## Exit Criteria
- One coherent visibility model for all EDMS resources.
- One coherent completion/state model across EDMS services and listeners.
