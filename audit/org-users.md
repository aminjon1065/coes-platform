# Module: Organization & Users

## Overview
**Organization** models the government hierarchical structure: departments, sub-departments, positions, command chains, and org-level configuration. It is the authority source for `isSubordinateTo()` — a core function used throughout the authorization layer.

**Users** manages user profiles, position assignments (a user can occupy multiple positions), preferences, and position occupant resolution used by EDMS and Tasks for assignment routing.

---

## Current Issues

### Organization

- ❌ **`isSubordinateTo()` result not cached** — This method is called on every resolution issue, task assignment, and authorization decision. It likely traverses the org hierarchy recursively in the DB. Under load, this becomes a hot path with no caching.
- ❌ **No position vacancy handling** — When `getPositionOccupant()` returns null (position is vacant), services like `ResolutionService` silently set `assignedUserId = null`. Assignments to vacant positions create unroutable work items with no alerting.
- ❌ **Circular org hierarchy not prevented** — No DB constraint or application check prevents a department from being set as its own parent (directly or via cycle). A circular reference makes `isSubordinateTo()` loop infinitely.

### Users

- ❌ **Multi-position occupancy not surfaced in JWT** — A user can hold multiple positions, but the JWT only carries a single `positionId`. There is no mechanism for a user to switch their active position context within a session, and no UI for this is described.
- ❌ **`getPositionOccupant()` returns the first occupant by insertion order** — If a position has multiple occupants (e.g., acting + primary), the selection is non-deterministic.

---

## Missing Functionality

- 🚫 **`isSubordinateTo()` result caching** — Redis cache with key `org:subordinate:{childId}:{parentId}` and TTL tied to org structure change events.
- 🚫 **Vacancy notification** — When a position becomes vacant, notify the department head and HR position.
- 🚫 **Position switch endpoint** — `POST /users/me/active-position` to switch the user's active context; reissue a position-scoped token.
- 🚫 **Org chart change audit** — Org structure changes (department moves, position reassignments) must emit audit events.
- 🚫 **Org hierarchy depth limit** — No guard against deeply nested (>15 levels) org structures that degrade traversal performance.

---

## Technical Debt

- 🧱 **Command chain resolution is O(n) per operation** — Hierarchy traversal scales linearly with org depth. For a 10-level hierarchy with 1000 positions, resolution authority checks are expensive. Use a materialized path or nested set model for O(1) ancestor lookups.
- 🧱 **`UsersService` and `OrgService` are tightly coupled** — `ResolutionService` injects both. This means a change to either service's interface requires updating resolution service. Should be mediated by an `OrgResolver` that wraps both.

---

## Risks

- 🔓 **Infinite loop on circular org reference** — A circular `parentId` in the departments table causes `isSubordinateTo()` to loop until stack overflow, taking down the request.
- 🔓 **Vacant position assignments are unroutable** — Work items assigned to vacant positions are invisible to any user. In an emergency response scenario, this directly impacts operational capability.

---

## Recommendations

- ✅ **Cache `isSubordinateTo()` result:**
  ```typescript
  const cacheKey = `org:subordinate:${childId}:${parentId}`;
  const cached = await this.redis.get(cacheKey);
  if (cached !== null) return cached === '1';
  const result = await this.computeIsSubordinateTo(childId, parentId);
  await this.redis.set(cacheKey, result ? '1' : '0', 'EX', 300);
  return result;
  ```
  Invalidate `org:subordinate:*` on any org structure change.
- ✅ **Add circular reference guard in `OrgService.setParent()`:**
  ```typescript
  const ancestors = await this.getAncestors(newParentId);
  if (ancestors.includes(departmentId)) {
    throw new BadRequestException('Circular org hierarchy detected');
  }
  ```
- ✅ **Add vacant position alerting in `getPositionOccupant()`:**
  ```typescript
  if (!occupant) {
    await this.notificationsService.notifyDepartmentHead(positionId, 'POSITION_VACANT_ASSIGNMENT_ATTEMPTED');
  }
  ```
- ✅ **Define occupant selection priority** — Primary occupant > Acting occupant > First by seniority. Document and enforce this rule in `getPositionOccupant()`.
- ✅ **Switch to materialized path for hierarchy** — Add `path ltree` column (PostgreSQL `ltree` extension) to `departments` table for O(1) ancestor/descendant queries.
