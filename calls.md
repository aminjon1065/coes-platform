Следующий P0 по calls.
1. Session Access Symmetry
   •
   calls.service.ts Проверить все методы рядом с уже исправленным getSession(): listSessions, join, leave, end, listRecordings, getRecording, deleteRecording, signal/signaling helpers.
   •
   Риск: getSession() уже защищён, а соседние методы могут всё ещё жить только на classification или sessionId.
2. Participant Lifecycle Guards
   •
   calls.service.ts Проверить: может ли пользователь повторно войти после исключения, войти в ended session, оставить/закрыть чужую сессию, читать participant list без membership.
   •
   Ожидаемый фикс: единые helpers уровня assertSessionVisibility() assertParticipantAccess() assertSessionMutationAccess()
3. Ended/Archived Session Behavior
   •
   calls.service.ts Проверить, что происходит после ENDED: можно ли ещё join, можно ли слать signaling, можно ли менять participant state, можно ли редактировать metadata.
   •
   Риск: ended call остаётся “полуживой”.
4. Recordings Security
   •
   calls.service.ts Проверить recordings path отдельно.
   •
   Что искать: видимость recording только участникам/инициатору, удаление recording только владельцу или authorized supervisor, нельзя ли по recordingId получить чужую запись.
   •
   Это один из самых важных privacy-блоков.
5. Signaling/Auth Drift
   •
   calls.controller.ts
   •
   calls.service.ts Проверить, что controller везде прокидывает sub, positionId, clearance, и что сервис реально использует их во всех sensitive methods.
   •
   Риск: часть API уже живёт на actor-aware contract, часть ещё нет.
6. Channel/Call Link Integrity Если calls связаны с chat/channel/document/task:
   •
   проверить, что пользователь не может получить доступ к call через более слабый linked resource path;
   •
   проверить, что membership канала и participant call не расходятся.
7. Concurrency/Idempotency
   •
   join same session twice
   •
   leave after ended
   •
   end session twice
   •
   duplicate participant rows
   •
   duplicate recording finalize
   •
   duplicate signaling completion event Это часто не security-bug, но даёт продовые инциденты.
8. Tests To Add Immediately
   •
   calls.service.spec.ts Добавить:
   •
   outsider cannot list/read/join чужую session
   •
   removed participant cannot rejoin
   •
   ended session rejects join/signal
   •
   participant can read own session but not delete чужую recording
   •
   non-participant cannot read/get recording
   •
   duplicate end/join/leave paths are idempotent or correctly rejected