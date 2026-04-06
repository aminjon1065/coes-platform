# ADR-004: Four-Layer Authorization Model

**Date:** 2026-01-20
**Status:** Accepted
**Deciders:** Platform Architecture Team, Security Officer

---

## Context

Government emergency management systems have complex access control requirements:

- A field operator should see only tasks assigned to their department
- A department head can approve documents in their department but not another's
- A classified document requires a specific security clearance regardless of role
- During a declared emergency, specific users receive temporary elevated permissions (delegations)
- An IAM admin managing users should not also be able to approve emergency declarations

Simple RBAC (role → permission) is insufficient for these requirements. Pure ABAC (attribute-based) is too complex to administer correctly.

## Decision

A **four-layer authorization model** evaluated in order:

```
Layer 1: RBAC        — Does the user's role grant this permission?
Layer 2: Scope       — Does the user's positional authority cover this department?
Layer 3: Clearance   — Does the user's classification level ≥ resource's classification?
Layer 4: Context     — Active delegations, acting assignments, emergency overrides?
```

All four layers must pass for access to be granted. Any layer returning DENY short-circuits the evaluation.

## Implementation

`AuthorizationService.can(permission: string, context: AuthzContext)` evaluates all layers and returns `AuthzDecision { allowed: boolean; reason: string }`.

**Layer 1 — RBAC:**
`UserRoleAssignment` table maps users to roles. `Role` entities have M:M with `Permission` entities. A user's effective permissions are the union of all non-expired, non-revoked role assignments. Results are cached in Redis for 60 seconds (`authz:{userId}` key) to avoid per-request DB lookups. Cache is invalidated on role assignment changes.

Role hierarchy: a role can declare `parentRoleId` and inherits all parent permissions transitively.

**Layer 2 — Scope:**
Each `UserRoleAssignment` has an optional `departmentScopeId`. When set, the role's permissions are only active for operations within that department or its descendant departments (evaluated via the org tree closure table).

**Layer 3 — Clearance:**
Resources carry a `classificationLevel` (0 = public, 1 = internal, 2 = confidential, 3 = secret). Users carry `clearanceLevel`. Access is denied when `userClearance < resourceClassification`.

**Layer 4 — Context:**
`Delegation` entities grant a user temporary additional permissions from a delegating user (e.g., acting head of department during leave). Active delegations contribute additional permissions to the RBAC evaluation. Delegations have mandatory expiry times.

**Emergency override:**
An `EMERGENCY_OVERRIDE` system event (emitted by the IAM admin) temporarily raises all active users' effective clearance by +1 level for a configurable duration. Recorded in the audit log.

## Rationale

**Why four layers instead of pure RBAC?**

In practice, government systems that start with pure RBAC end up with an explosion of roles (e.g., "operator-dushanbe-dept-47-clearance-2") because scope and clearance requirements are baked into role names. This makes role management a database administration nightmare. Separating scope and clearance as explicit dimensions keeps the role catalogue small and comprehensible.

**Why cache RBAC results?**

The authorization check is called on every request (via `PermissionGuard`). Without caching, each request requires 3–5 DB queries to resolve the role assignment chain and permission inheritance tree. At 1,000 req/s (peak incident response), this would represent 3,000–5,000 additional queries/second.

**Why not CASL or OPA?**

CASL is a good library but adds a dependency and abstraction layer over a model we own completely. OPA is powerful but requires a separate policy engine process and a Rego policy language that the government IT team cannot maintain. The in-code four-layer model is transparent, testable, and understandable by any NestJS developer.

## Consequences

- Every protected endpoint must call `authz.can(permission, context)` — either directly or via the `@RequirePermission()` decorator + `PermissionGuard`.
- Clearance levels must be assigned to user profiles by an IAM admin. Default clearance is 0 (public).
- Delegation chains are not transitive (A delegates to B, B cannot sub-delegate to C).
- The 60-second RBAC cache means role revocations take up to 60 seconds to take effect. This is acceptable for the threat model (immediate revocation can be forced by clearing the Redis key).
