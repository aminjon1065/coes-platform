# Module: EDMS (Electronic Document Management System)

## Overview
Core business module. Manages the full lifecycle of official government documents: creation, registration (unique serial number assignment), multi-step approval workflows, resolutions (directives), executor assignments, and archival. Documents are the primary unit of authority within the platform.

---

## Current Issues

- ❌ **Resolution controller has no auth guard** — `ResolutionController` has no `@UseGuards()` decorator and the global `PermissionGuard` is not registered. Any authenticated user can issue resolutions on any document they can view, bypassing command-chain authority.
- ❌ **`fileCompletionReport` does not validate `report` body** — `@Body('report') report: string` has no class-validator pipe. An empty string or `undefined` is accepted silently, creating blank completion records.
- ❌ **`issueResolution` uses non-atomic N+1 saves** — Each `ExecutorAssignment` is saved individually in a `for` loop with no transaction wrapping. If the 3rd of 5 saves fails, a partial resolution is persisted with no rollback.
- ❌ **`edms-task-sync.listener` duplicates the `checkAllAssignmentsComplete` logic** — The identical "are all primary assignments done?" check exists in both `ResolutionService.checkAllAssignmentsComplete()` and inline in `EdmsTaskSyncListener.onDocumentTaskCompleted()`. The listener version also calls `documentRepo.update()` directly, bypassing the document service's state machine — there is no `COMPLETED` status validation, no audit event, and no outbox publication.
- ❌ **Document visibility check is positional, not hierarchical** — `hasDocumentVisibility()` checks exact `positionId` matches against `recipients`. A superior in the command chain who is not an explicit recipient cannot see the document even if they have appropriate clearance and authority.
- ❌ **Registration number collision window** — The `UNIQUE` constraint on registration numbers is the only concurrency guard. Under concurrent load, the application layer generates the number before the DB insert — this is a TOCTOU race.

---

## Missing Functionality

- 🚫 **Workflow step execution engine** — `WorkflowStep` and `WorkflowTemplate` entities exist but there is no service logic to progress steps, enforce step order, route approvals, or handle step timeouts.
- 🚫 **Approval routing** — No automated determination of who should approve a document at each workflow step. Approvers must be assigned manually.
- 🚫 **Document deadline enforcement** — No cron job or scheduler marks documents as overdue when their workflow deadline passes.
- 🚫 **Bulk operations** — No mass transition, bulk registration, or batch approval API.
- 🚫 **Document template / copy-from** — No mechanism to create a new document based on a previous one.
- 🚫 **Resolution execution status** — Resolutions are issued and linked to tasks, but there is no aggregate `ResolutionStatus` (pending / in_progress / fulfilled / overdue).
- 🚫 **`@Body()` DTO for `fileCompletionReport`** — A proper `FileCompletionReportDto` with `@IsString() @IsNotEmpty() @MaxLength(5000)` is missing.

---

## Technical Debt

- 🧱 **Direct `documentRepo.update()` in listener** — The `EdmsTaskSyncListener` writes directly to the document table using raw TypeORM `update()`, bypassing all business rules, state machine validation, audit emission, and outbox publication. Document status transitions must go through `DocumentService.transition()`.
- 🧱 **`recordHistory` swallows errors silently** — The `.catch()` only logs; a failed history record means the audit trail has silent gaps.
- 🧱 **`positionId!` non-null assertion in controller** — `req.user.positionId!` will throw a cryptic runtime error if the user has no assigned position. Should be validated explicitly with a guard or checked in the service.
- 🧱 **`WorkflowHistory` and `AuditEvent` overlap** — Both track EDMS actions. The responsibility boundary is unclear; consumers must query two tables to reconstruct a full event history.
- 🧱 **`getAccessibleDocument` called on every resolution/assignment query** — Results in a redundant DB round-trip for every sub-resource access. Should use eager loading or a single join query.

---

## Risks

- 🔓 **Partial resolution persistence** — Non-transactional N+1 saves mean a failed mid-loop insert leaves orphaned assignments with no associated resolution state.
- 🔓 **State machine bypass via listener** — `EdmsTaskSyncListener` sets `status = COMPLETED` without going through the state machine, meaning `CANCELLED` or `ARCHIVED` documents could be incorrectly transitioned to `COMPLETED`.
- 🔓 **Visibility bypass for superiors** — Command-chain superiors cannot see documents unless explicitly added as recipients, breaking audit and oversight requirements.
- 🔓 **Registration collision under load** — Concurrent registration requests for the same document type and year could generate duplicate sequence numbers before DB constraint catches them, causing 500 errors instead of clean conflict resolution.

---

## Recommendations

- ✅ **Wrap `issueResolution` in a transaction:**
  ```typescript
  await this.dataSource.transaction(async (manager) => {
    const resolution = await manager.save(Resolution, ...);
    for (const execDto of dto.executors) {
      await manager.save(ExecutorAssignment, ...);
    }
    await manager.save(WorkflowHistory, ...);
  });
  ```
- ✅ **Fix `EdmsTaskSyncListener` to call `DocumentService.transition()`** instead of raw `documentRepo.update()`. The service must emit audit events and outbox messages on every status change.
- ✅ **Add `FileCompletionReportDto`:**
  ```typescript
  export class FileCompletionReportDto {
    @IsString() @IsNotEmpty() @MaxLength(5000)
    report: string;
  }
  ```
- ✅ **Use database sequence for registration numbers** — PostgreSQL `SEQUENCE` object per document type + year guarantees uniqueness without TOCTOU:
  ```sql
  SELECT nextval('reg_seq_<typeCode>_<year>');
  ```
- ✅ **Add `@RequirePermission('document.resolution.issue')` to `ResolutionController`** and register `PermissionGuard` globally.
- ✅ **Extend visibility to command-chain superiors** — In `hasDocumentVisibility()`, also call `orgService.isSubordinateTo(document.createdByPositionId, actorPositionId)` and return true if the actor is a superior with sufficient clearance.
- ✅ **Add `ResolutionStatus` derived from executor assignments** — Either a computed view or a maintained denormalized field updated by the listener.

---

## Refactored Design

```
edms/
  services/
    document.service.ts          ← state machine owner; all transitions here
    document-query.service.ts    ← read-side; handles visibility + clearance
    registration.service.ts      ← serial number generation (DB sequence)
    resolution.service.ts        ← resolution + assignment management
    workflow.service.ts          ← NEW: step execution engine
    workflow-routing.service.ts  ← NEW: approver determination
  listeners/
    edms-task-sync.listener.ts   ← delegates to document.service for transitions
  dto/
    file-completion-report.dto.ts  ← NEW
    issue-resolution.dto.ts
```
