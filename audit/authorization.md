# Module: Authorization (RBAC & Access Control)

## Overview
Implements a 4-layer access control model: (1) Capability/RBAC via roles and permissions, (2) Positional Scope via org hierarchy, (3) Classification level gating, (4) Policy-based rules (delegations, acting assignments, emergency overrides). This is the most security-critical module in the system.

---

## Current Issues

- ❌ **`PermissionGuard` is not registered as APP_GUARD** — The guard exists and is functional in isolation, but it is not applied globally. Controllers that don't explicitly apply it receive zero permission enforcement. This means virtually all business endpoints are currently unprotected by RBAC.
- ❌ **Classification barriers not enforced at data access layer** — Classification fields exist on Document, File, and other entities. The check `if (actorClearance < document.classification) throw ForbiddenException` exists in `ResolutionService` but is absent in the generic document list/query endpoints. A user with clearance=1 can query classification=2 documents by hitting the list endpoint.
- ❌ **Delegation expiry not checked** — `Delegation.expiresAt` is stored in the database but the authorization service does not validate it at decision time. Expired delegations continue to grant permissions.
- ❌ **Acting assignment entity not found** — The RBAC design document describes acting assignments (temporary position occupancy), but no entity, service method, or migration implements this concept.
- ❌ **Emergency override not implemented** — Described in architecture docs; no code exists to elevate permissions temporarily with audit trail.

---

## Missing Functionality

- 🚫 **Global `PermissionGuard` registration** — Must be added to `APP_GUARD` array in `app.module.ts`.
- 🚫 **Classification enforcement middleware/interceptor** — A cross-cutting mechanism that strips or blocks resources below the caller's clearance before they leave the service layer.
- 🚫 **Delegation validation at auth time** — `AuthorizationService.can()` must check `delegation.expiresAt > now()` and `delegation.isActive`.
- 🚫 **Acting assignment entity + service** — `ActingAssignment { positionId, actingPositionId, startAt, endAt, grantedById }`.
- 🚫 **Emergency override service** — Elevation with mandatory reason, time limit, and dual-approval requirement.
- 🚫 **Permission cache invalidation on role change** — Redis cache TTL is 60s; a revoked role remains valid for up to 60 seconds.

---

## Technical Debt

- 🧱 **`can()` method has no test coverage** — The most critical authorization path lacks unit tests for edge cases (null positionId, hierarchy boundary, classification boundary).
- 🧱 **Scope validation duplicated in services** — `assertAssignmentAuthority()` in tasks, `orgService.isSubordinateTo()` in resolution — each service re-implements scope checking instead of delegating to a single `AuthorizationService.assertScope()`.
- 🧱 **RBAC cache key strategy inconsistent** — Some cache keys include `userId`, others include `credentialId`. Under user impersonation or acting assignments these would diverge.
- 🧱 **No `@RequirePermission()` decorator usage audit** — Unclear which endpoints have the decorator and which don't. There is no linting rule to enforce it.

---

## Risks

- 🔓 **CRITICAL: All endpoints lack permission enforcement** — The missing global guard registration means a valid JWT holder can call any endpoint regardless of role. This is a production-blocking security gap.
- 🔓 **Classification data leak** — List endpoints for documents, files, and tasks do not filter by caller clearance. Confidential and secret data is exposed to any authenticated user.
- 🔓 **Stale delegation grants access after revocation** — An attacker whose delegation was revoked retains access until cache TTL expires.
- 🔓 **Scope bypass via direct ID reference** — Endpoints that accept a `resourceId` as path param don't validate the caller's hierarchical authority over that resource.

---

## Recommendations

- ✅ **Register PermissionGuard globally immediately:**
  ```typescript
  // app.module.ts
  providers: [
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: PermissionGuard }, // ADD THIS
  ]
  ```
- ✅ **Add clearance filter to all list/find operations** — Either in a TypeORM global filter or via a `ClearanceInterceptor` that removes sub-clearance items from responses.
- ✅ **Add `assertClassification(resource, actorClearance)` to `AuthorizationService`** — Single method, called everywhere, testable in isolation.
- ✅ **Fix delegation validation:**
  ```typescript
  if (delegation.expiresAt && delegation.expiresAt < new Date()) {
    throw new ForbiddenException('Delegation has expired');
  }
  ```
- ✅ **Reduce cache TTL to 10s or implement pub/sub invalidation** — On role change, emit `auth.role_changed:{userId}` to Redis pub/sub; all instances flush the key immediately.
- ✅ **Write unit tests for `AuthorizationService.can()`** covering: no role, insufficient clearance, expired delegation, acting assignment, cross-department scope.

---

## Refactored Design

```
authorization/
  guards/
    permission.guard.ts      ← registered as APP_GUARD globally
    classification.guard.ts  ← NEW: clearance check on data responses
  services/
    authorization.service.ts ← can(), assertScope(), assertClassification()
    delegation.service.ts    ← delegation CRUD + expiry enforcement
    acting-assignment.service.ts  ← NEW
    emergency-override.service.ts ← NEW
  decorators/
    require-permission.decorator.ts
    public.decorator.ts
  cache/
    permission-cache.service.ts  ← isolated cache logic, invalidation
```
