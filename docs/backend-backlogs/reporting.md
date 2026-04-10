# Reporting Backlog

Priority: `P1`

## Current Assessment
- Module looks more like a scaffold than a production reporting domain.
- No test coverage currently.

## P1
- Define reporting domain scope explicitly: exports, scheduled reports, delivery, ACL, audit.
- Implement safe report generation contracts and query boundaries.
- Add report job lifecycle and delivery tracking.
- Add baseline tests for authorization and export job integrity.

## P2
- Add recurring report scheduling and operator tooling.
- Add cross-domain report templates.

## Exit Criteria
- Reporting is a real domain with tests, ACL, and auditability.
