# IAM Backlog

Priority: `P2`

## Current Assessment
- Core auth paths are relatively mature.
- Still needs periodic hardening because mistakes here have system-wide impact.

## P1
- Review session revocation, service accounts, SSO edge cases, and token family behavior.
- Expand tests around compromised refresh-token and cross-user session isolation scenarios.

## P2
- Add more operational controls for suspicious session behavior and admin investigation.

## Exit Criteria
- Session lifecycle and SSO edge cases are strongly covered.
