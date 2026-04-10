# Analytics Backlog

Priority: `P1`

## Current Assessment
- Domain has meaningful code but weak verification density.
- Likely to contain aggregate correctness and filtering edge cases.

## P1
- Review aggregation logic and access filters.
- Add tests for recalculation, rebuild, and failure-recovery paths.
- Verify cross-domain analytical reads do not bypass source-domain visibility.

## P2
- Add operational rebuild tooling.
- Add stronger metrics and observability around lag/freshness.

## Exit Criteria
- Analytical reads respect domain security boundaries.
- Aggregate rebuild and failure paths are tested.
