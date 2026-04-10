# Module: Tasks

## Overview
Manages the full lifecycle of work assignments within the platform. Supports 11-state status machine (draft → assigned → accepted → in_progress → on_hold → completed → verified → returned → cannot_execute → cancelled → closed), hierarchical subtasks, co-executors, observers, comment threads, attachments, escalation, and bidirectional sync with EDMS resolutions.

---

## Current Issues

- ❌ **No transaction around task creation from EDMS** — When `TasksEdmsListener` creates a task from an `edms.resolution_issued` event, each task and assignment is saved independently. A partial failure leaves orphaned task records.
- ❌ **`assertAssignmentAuthority()` coverage incomplete** — The method validates the command chain for the primary assignee, but co-executors and observers are not validated. A user can designate any position as a co-executor regardless of hierarchy.
- ❌ **Subtask depth counter is application-enforced only** — `MAX_SUBTASK_DEPTH = 3` is checked in the service but not enforced by a DB constraint. A direct DB insert or a concurrency race can exceed the limit.
- ❌ **State machine transition validation not idempotent** — `transition(taskId, newStatus)` reads current status then writes new status in two separate queries without a row lock. Under concurrent requests (e.g., two supervisors returning a task simultaneously), race conditions can produce invalid state.
- ❌ **`tasks.document_task_completed` event payload missing `sourceResolutionId` in some code paths** — The event is emitted with `sourceResolutionId: null` when a task is completed without going through the EDMS workflow, which is valid. But `EdmsTaskSyncListener` does not distinguish between null-resolution tasks and EDMS-originated tasks consistently.

---

## Missing Functionality

- 🚫 **Task dependencies** — No way to express "Task B cannot start until Task A is verified". Critical for government project chains.
- 🚫 **Recurring tasks / templates** — No mechanism to clone a completed task into a new cycle (e.g., monthly reporting task).
- 🚫 **Multi-verifier support** — Only a single verifier per task. High-stakes tasks should support quorum verification.
- 🚫 **Proactive deadline reminders** — Only reactive escalation (overdue notification after deadline passes). No configurable reminder schedule (e.g., 48h, 24h, 2h before deadline).
- 🚫 **Time tracking** — No actual hours worked vs. estimated hours fields.
- 🚫 **Task delegation** — No mechanism for an executor to formally delegate a task to another position with approval.
- 🚫 **Bulk status transitions** — No API to close/cancel multiple tasks at once (required for incident response cleanup).

---

## Technical Debt

- 🧱 **11-state machine in a flat transition map** — `TASK_TRANSITIONS` map is readable but not enforced by the type system. A wrong string literal key compiles fine. Use a state machine library (e.g., XState, or a typed enum-keyed Map) to make invalid transitions a compile-time error.
- 🧱 **`TaskHistory` and audit events are redundant** — Both record status changes. Decide: `TaskHistory` is the user-visible changelog, `AuditEvent` is the compliance record — document this split clearly and ensure both are always written in the same transaction.
- 🧱 **Escalation listener has hardcoded supervisor lookup** — `direct supervisor + assigning authority` is the only escalation path. A configurable escalation matrix (who to notify at which delay) is needed for complex org structures.
- 🧱 **`progress_percent` has no business rule enforcement** — Any value 0–100 is accepted. When status is `verified`, `progress_percent` should be forced to 100. When status is `draft`, it should be 0.
- 🧱 **Co-executor assignment creates a separate `TaskAssignment` row** — Querying all assignments for a task requires a join even for simple single-executor tasks. Consider a `jsonb` column for co-executors only if always read together.

---

## Risks

- 🔓 **Race condition on status transition** — Two concurrent `PATCH /tasks/{id}/transition` requests can both read `status = in_progress`, both validate `in_progress → completed` as valid, and both write `completed`, producing duplicate `TaskHistory` entries and double-triggering the EDMS sync listener.
- 🔓 **Co-executor authority bypass** — Co-executors can be assigned to any position, potentially leaking task content to unauthorized positions.
- 🔓 **Subtask depth exceeded via race** — Two concurrent requests to add a subtask to a depth-2 task can both pass the depth check before either saves, resulting in a depth-3 subtask.

---

## Recommendations

- ✅ **Use `SELECT ... FOR UPDATE SKIP LOCKED` on status transitions:**
  ```typescript
  await this.dataSource.transaction(async (manager) => {
    const task = await manager
      .createQueryBuilder(Task, 't')
      .setLock('pessimistic_write')
      .where('t.id = :id', { id: taskId })
      .getOneOrFail();
    // validate + update inside transaction
  });
  ```
- ✅ **Validate co-executor authority in `assertAssignmentAuthority()`** — Apply the same `orgService.isSubordinateTo()` check used for primary executors.
- ✅ **Add DB CHECK constraint for subtask depth** — Use a recursive CTE in a DB trigger or a deferred constraint function.
- ✅ **Enforce `progress_percent` invariants:**
  ```typescript
  if (newStatus === TaskStatus.VERIFIED) dto.progressPercent = 100;
  if (newStatus === TaskStatus.DRAFT) dto.progressPercent = 0;
  ```
- ✅ **Implement reminder scheduler** — Store `reminderSchedule: number[]` on tasks (minutes before deadline), use a cron-based or BullMQ delayed job to emit `task.deadline_reminder` events.
- ✅ **Add task dependency entity** — `TaskDependency { predecessorId, successorId, type: 'finish_to_start' | 'start_to_start' }` with guard in `transitionToInProgress()` that checks all predecessors are verified.

---

## Refactored Design

```
tasks/
  services/
    tasks.service.ts             ← creation, query, authority validation
    task-transition.service.ts   ← NEW: state machine with row-locking
    task-schedule.service.ts     ← NEW: reminders, overdue marking
    task-dependency.service.ts   ← NEW: dependency graph traversal
  listeners/
    tasks-edms.listener.ts       ← EDMS resolution → task creation (transactional)
    tasks-escalation.listener.ts ← overdue escalation
  entities/
    task-dependency.entity.ts    ← NEW
```
