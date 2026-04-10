P0: Tasks First
Ниже конкретный backend backlog по tasks, что я бы делал первым проходом.
1. Access-Control Review
   •
   tasks.service.ts Проверить getTask, listMyTasks, listTasksForSupervisor, updateTask, transitionStatus, verifyCompletion, reassign, delete/cancel, addComment, getComments, addAttachment, removeAttachment.
   •
   Цель: у всех read/write/destructive методов должна быть одна и та же модель доступа: author / assignee / co-executor / supervisor / assigning authority.
   •
   Ожидаемый фикс: вынести единые helpers уровня assertTaskVisibility() assertTaskMutationAccess() assertTaskDestructiveAccess()
2. State Machine Hardening
   •
   tasks.service.ts Проверить переходы: DRAFT -> ASSIGNED ASSIGNED -> IN_PROGRESS IN_PROGRESS -> COMPLETED COMPLETED -> VERIFIED OVERDUE CANCELLED поведение parent/subtask.
   •
   Риск: разные методы могут менять статус в обход общей transition-логики.
   •
   Ожидаемый фикс: один central guard: assertTransitionAllowed(from, to, actorContext) без локальных “if status === …” по сервису.
3. Reassignment Integrity
   •
   tasks.service.ts Отдельно проверить reassign и любые методы замены исполнителя.
   •
   Что искать: можно ли перекинуть задачу не по command chain, остаются ли старые assignments активными, ломается ли history, теряется ли supervisor visibility.
   •
   Ожидаемый фикс: reassignment только через явный workflow: deactivate old assignment, create new assignment, append history, emit event, recalc parent/supervisor views.
4. Verification vs Completion
   •
   tasks.service.ts Проверить разницу между executor completed и supervisor verified.
   •
   Риск: исполнитель или посторонний supervisor может сам себе закрыть задачу до верификации.
   •
   Ожидаемый фикс: verifyCompletion() только для допустимого supervisor/assigning authority, COMPLETED и VERIFIED не смешивать.
5. Parent/Subtask Propagation
   •
   tasks.service.ts Проверить: что происходит, если один child CANCELLED, один RETURNED/BLOCKED, все children COMPLETED, parent уже OVERDUE.
   •
   Риск: parent либо зависает, либо закрывается раньше времени.
   •
   Ожидаемый фикс: формализовать агрегатор статусов parent-а, как мы уже сделали для edms assignments.
6. Attachments and Comments Symmetry
   •
   tasks.service.ts
   •
   tasks.controller.ts Мы уже закрыли getComments и removeAttachment, но надо добить весь набор: comment create/delete/edit, attachment add/remove/list/read.
   •
   Риск: read защищён, write нет, или наоборот.
7. Event Consistency
   •
   tasks.service.ts
   •
   listeners в tasks Проверить, что события не эмитятся: дважды, до сохранения, после fail-path, в несогласованном payload.
   •
   Особенно: overdue, status changed, task channel requested, edms sync hooks.
8. Tests To Add Immediately
   •
   tasks.service.spec.ts Добавить регрессии на:
   •
   outsider cannot read/update/reassign/delete foreign task
   •
   ex-assignee cannot mutate old task
   •
   supervisor can read but not perform executor-only actions
   •
   executor cannot verify own completion
   •
   cancelled child does not wrongly complete parent
   •
   returned/blocked child blocks parent completion
   •
   reassignment preserves audit/history/visibility
   •
   attachment/comment operations obey same ACL as task itself
9. Secondary P0 After Tasks После tasks я бы сразу шёл:
   •
   calls session/recording/participant security
   •
   inbox dedupe/replay/idempotency
   •
   outbox retry/integrity/duplicate publish