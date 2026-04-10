# Module: IAM (Identity & Access Management)

## Overview
Handles authentication, credential management, JWT issuance, MFA (TOTP), session lifecycle, and SSO integration stubs (LDAP, SAML). Acts as the trust root for the entire platform — every authenticated request flows through this module's guards and strategies.

---

## Current Issues

- ❌ **Non-rotating refresh tokens** — `RefreshToken` entity is persisted but tokens are never rotated on use. A leaked refresh token grants indefinite access until the 7-day TTL expires with no way to detect or revoke it.
- ❌ **MFA scope not validated at every guard** — JWT tokens issued with `scope: 'mfa_pending'` are only blocked by the MFA guard; any endpoint that bypasses that guard (or uses a custom guard) is accessible with an incomplete authentication.
- ❌ **No real-time token revocation** — There is no blocklist/revocation cache. A compromised access token remains valid for its full 15-minute lifetime even after a forced logout or password reset.
- ❌ **SSO controllers missing** — `SsoConfiguration` entity and `SsoService` stubs exist but no routes expose SSO configuration management. LDAP/SAML integrations are non-functional.
- ❌ **No password history enforcement** — Users can reset their password to a previously used password, undermining forced-rotation policies.

---

## Missing Functionality

- 🚫 **Token revocation / blocklist** — Redis-backed JWT blocklist for immediate session invalidation.
- 🚫 **Refresh token rotation** — On each use of a refresh token, issue a new one and invalidate the old.
- 🚫 **Password expiry policy** — Configurable maximum password age with forced change on next login.
- 🚫 **SSO management endpoints** — CRUD for SAML/LDAP configurations (only entity/service stubs exist).
- 🚫 **Device fingerprinting** — No binding of refresh tokens to device/IP to detect token theft.
- 🚫 **Audit of token refresh events** — Token refreshes are not emitted to the audit log.
- 🚫 **Concurrent session limit** — No per-user cap on active refresh tokens.

---

## Technical Debt

- 🧱 **`AuthenticatedRequest` interface duplicated** — The inline `interface AuthenticatedRequest` appears in multiple controllers instead of a shared type declaration in `auth.types.ts` or similar.
- 🧱 **JWT payload shape spread across files** — `sub`, `clearance`, `positionId`, `scope` are accessed by string key in many places. A typed `JwtPayload` DTO with validation should be the single source of truth.
- 🧱 **Brute-force state stored in DB** — Login attempt counters are in the credentials table. Under heavy concurrent load, race conditions could allow more than 5 attempts before lockout. Redis atomic counters (INCR + EXPIRE) are the correct tool here.
- 🧱 **`mfa_pending` scope is a magic string** — Defined and checked in multiple files; should be a typed enum `AuthScope`.

---

## Risks

- 🔓 **Refresh token compromise = permanent access** — No rotation means one stolen token is permanently valid.
- 🔓 **Race condition on brute-force counter** — Parallel requests could bypass lockout (low probability, high impact for a government system).
- 🔓 **MFA bypass via custom guard** — Any new endpoint that uses a non-standard guard and doesn't check `scope` claim skips MFA enforcement. There is no global enforcer.
- 🔓 **Revocation gap = 15-minute exposure window** — A password reset or admin-forced logout does not invalidate in-flight tokens.

---

## Recommendations

- ✅ **Implement refresh token rotation:** On `POST /auth/refresh`, atomically delete the old token record and issue a new one. Store family ID to detect reuse attacks (invalidate entire family on reuse).
- ✅ **Add Redis JWT blocklist:** On logout / password-change / admin-disable, write `SET blocklist:{jti} 1 EX <remaining_ttl>`. In `JwtStrategy.validate()`, check this key before returning the payload.
- ✅ **Create shared `JwtPayload` type** in `libs/auth/jwt-payload.ts` and import it everywhere instead of inline `req.user` casts.
- ✅ **Move brute-force counters to Redis:** `SET bf:{credentialId} <count> EX 1800 NX` — use Lua script for atomic check-and-increment.
- ✅ **Promote `scope` to a typed enum** and add a `RequiredScope` decorator / global guard check.
- ✅ **Implement SSO controllers** — at minimum, expose `GET /sso/providers` and `POST /sso/providers` for SAML/LDAP configuration.

---

## Refactored Design

```
iam/
  strategies/
    jwt.strategy.ts          ← validates + checks Redis blocklist
    local.strategy.ts
  guards/
    jwt-auth.guard.ts        ← global APP_GUARD
    scope.guard.ts           ← validates scope claim (NEW)
  services/
    iam.service.ts           ← login, register, password management
    token.service.ts         ← NEW: issue, rotate, revoke tokens
    mfa.service.ts
    sso.service.ts
  types/
    jwt-payload.ts           ← NEW: shared typed payload
    auth-scope.enum.ts       ← NEW: typed scope enum
```
