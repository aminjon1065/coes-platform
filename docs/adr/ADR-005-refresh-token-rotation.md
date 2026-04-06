# ADR-005: Refresh Token Rotation with Family Tracking

**Date:** 2026-01-20
**Status:** Accepted
**Deciders:** Platform Architecture Team, Security Officer

---

## Context

JWT access tokens must be short-lived (15 minutes) to limit the blast radius of token theft. This requires a refresh token mechanism to maintain user sessions without repeated password prompts.

The risks to address:
1. **Refresh token theft** — an attacker intercepts a refresh token and uses it to maintain persistent access
2. **Token replay** — a stolen token is used after the legitimate user has already used it
3. **Session fixation** — a stolen token is kept valid indefinitely

Standard approaches:
- Long-lived refresh tokens with no rotation (simple, insecure)
- Refresh token rotation without family tracking (prevents replay but can't detect theft)
- **Refresh token rotation with family tracking** (detects theft via reuse detection)

## Decision

**Refresh token rotation with family tracking**, implementing the RFC 6749 / Auth0 "Refresh Token Rotation" pattern.

## Implementation

Every `RefreshToken` record has:
- `tokenHash` — SHA-256 of the opaque 72-character random token (never stored in plaintext)
- `family` — UUID grouping all tokens in one session chain
- `revokedAt` — null if active, timestamp if consumed/revoked

**Rotation flow:**
1. Client presents refresh token R₁
2. Server validates: exists, not revoked, not expired, user active
3. Server marks R₁ as `revokedAt = NOW()`
4. Server issues new access token A₂ + new refresh token R₂ (same family as R₁)
5. Client stores R₂, discards R₁

**Reuse detection (theft indicator):**
If R₁ is presented again after step 3 (someone else stole it), the server finds `revokedAt IS NOT NULL` and immediately revokes all tokens in that family — invalidating all sessions for that user chain.

**Token format:**
`uuidv4() + uuidv4()` = 72-character opaque string. Not a JWT (opaque tokens cannot be inspected client-side, preventing information leakage). Hashed with SHA-256 before storage.

**Logout:**
- `POST /auth/logout` — revokes a single refresh token (single-device logout)
- `POST /auth/logout-all` — revokes all active tokens for the user (all-device logout)

## Rationale

**Why family tracking?**

Without family tracking, token rotation prevents replay but cannot distinguish between:
- A legitimate rotation (user refreshed their session)
- An attacker who stole the token and refreshed first

With family tracking, if both the user and attacker try to use R₁ after it was rotated:
- The first succeeds and gets R₂
- The second tries R₁ (already `revokedAt` set) → triggers family revocation → logs out both user and attacker
- The user sees "session invalidated" and must re-authenticate

This is a detectable security event that triggers an `iam.token.reuse_detected` audit event for SIEM.

**Why 15-minute access tokens?**

15 minutes balances UX (transparent background refresh via the PWA's fetch interceptor) with security. If an access token is stolen (e.g., from a browser console or MITM in an unpatched browser), it is usable for at most 15 minutes before expiry.

**Why store token hashes, not tokens?**

If the `refresh_tokens` table is exfiltrated (SQL injection, DB dump), raw token storage would allow direct replay. SHA-256 hashes of random tokens are computationally infeasible to reverse.

## Consequences

- Clients must handle `401 Unauthorized` responses by attempting a token refresh before prompting the user to log in again.
- Mobile clients (field PWA) must persist the refresh token in secure storage (localStorage is acceptable given the PWA runs in a controlled device environment; a native app would use the Keychain/Keystore).
- The `refresh_tokens` table grows unbounded without cleanup. A nightly cron job purges tokens where `expires_at < NOW() - INTERVAL '7 days'` (already-expired tokens kept for audit log correlation).
