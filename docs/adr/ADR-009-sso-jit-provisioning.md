# ADR-009: SSO with JIT Provisioning over Pre-Provisioned Accounts

**Date:** 2026-03-15
**Status:** Accepted
**Deciders:** Platform Architecture Team, IT Operations

---

## Context

CoESCD's Tajikistan government deployment has ~1,200 potential platform users already managed in an Active Directory (AD) domain. The question is how to integrate these identities with the platform's `iam.user_credentials` table.

Options:
1. **Pre-provisioning (batch sync):** A cron job syncs all AD accounts into the platform at deploy time. Users log in with local credentials mirrored from AD.
2. **JIT provisioning:** User accounts are created in the platform automatically on their first SSO login.
3. **No local accounts for SSO users:** SSO users never have a row in `user_credentials`; all identity resolves through the IdP on every request.

## Decision

**JIT (Just-In-Time) provisioning** via `SsoService.provisionOrUpdate()`.

SSO users receive a `UserCredential` row on their first successful LDAP/SAML authentication. Subsequent logins refresh cached SSO attributes (email, displayName, groups) without re-provisioning.

Local password accounts (`passwordHash`) remain supported in parallel for:
- Service accounts (CI/CD, Airflow, monitoring agents)
- Emergency access accounts (break-glass accounts not tied to the AD)
- Users without AD accounts (external liaisons, temporary consultants)

## Rationale

**Why JIT over pre-provisioning?**

AD has ~1,200 accounts but not all will use the platform. Pre-provisioning all accounts creates noise (inactive users in queries, notification delivery to invalid mailboxes) and a maintenance burden (deleted AD accounts become stale platform accounts).

JIT provisioning is self-maintaining: users who never log in never get a record. Deactivation is handled by suspending the account in AD — the next login attempt will fail at LDAP bind, and the platform account can be marked `SUSPENDED` via the `iam.sso_login` event listener.

**Why keep local accounts?**

Pure federated identity (option 3) creates a hard dependency on the IdP's availability. If AD is unavailable during a crisis (which is precisely when the platform is most needed), no one can log in. Local break-glass accounts with strong passwords allow emergency access even when the LDAP/SAML chain is broken.

The `UserCredential` record for SSO users has `passwordHash = ''` (empty string). `bcrypt.compare('any', '')` always returns `false`, preventing accidental local login on SSO-only accounts.

**Attribute refresh on every login:**

SSO attributes (email, displayName, groups) are re-synced from the IdP on each successful login. This means:
- Group membership changes in AD are reflected on the next login without a manual sync job
- Email changes are picked up automatically
- The `sso_attributes JSONB` column stores the raw IdP attributes for auditing

**Username derivation:**

For LDAP: `sAMAccountName` is used as the platform username (lowercase, alphanumeric + `.`, `-`, `_`).
For SAML: the email local part is used as the username fallback.

Special characters (`+`, space, etc.) are replaced with `_` to keep usernames safe for display and API paths.

## Consequences

- A user's first LDAP/SAML login will be slightly slower due to the INSERT into `user_credentials`. Subsequent logins are UPDATE-only.
- The `iam.sso.provisioned` event should trigger creation of a `UserProfile` record in the Users module (a listener should be added if full user profile is needed).
- If two users have colliding derived usernames (e.g., `john.doe` from two different OUs), the second provisioning will fail with a unique constraint violation. A suffix counter should be added if this becomes a problem in practice.
- LDAP bind credentials (stored in `iam.sso_configurations.config` JSONB) are encrypted at the application layer before storage. The `config` column must be treated as sensitive data in backup and access policies.
