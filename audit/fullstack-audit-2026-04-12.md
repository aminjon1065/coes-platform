# CoESCD Platform — Fullstack Аудит (Архитектура / Backend / Frontend / DevOps / UX)

Дата: 2026-04-12  
Репозиторий: `/Users/aminjon/Desktop/coescd/coes-platform`

## 1) Executive Summary

Проект уже содержит сильный фундамент (модульный backend, разделение сервисов, Helm/Compose, наблюдаемость), но в текущем состоянии есть ряд системных блокеров:

1. Есть критичные конфигурационные рассинхроны между кодом и Helm (часть сервисов в k8s может стартовать в деградированном режиме или с некорректной маршрутизацией).
2. Монорепо в непоследовательном состоянии по менеджерам пакетов и lock-файлам; CI/CD покрывает не все приложения и часть quality gates фактически невалидна.
3. Реальное качество сборки frontend неоднородно: `portal-web` зависит от корректного `NODE_ENV`, `field-pwa` не собирается, линтеры во всех сервисах не запускаются из-за отсутствия конфигов ESLint.
4. В auth/realtime есть риски по безопасности и UX (маскирование ошибок, токен в query string, слабая диагностика 500/401).
5. Есть архитектурная неоднозначность по realtime (две реализации gateway одновременно).

Ниже детальная матрица проблем и улучшений с приоритетами.

## 2) Что проверено

- Структура монорепо, зависимости, lock-файлы, scripts.
- Backend (Nest): bootstrap/config/gateway/search/errors/files/health.
- Frontend: `portal-web`, `map-client`, `field-pwa`.
- Infra: Docker Compose, Nginx, Helm chart values/templates.
- CI/CD workflows.
- Фактические команды сборки/тестов.

## 3) Подтвержденные команды и фактические результаты

1. `npm run build -w @coescd/portal-web` при `NODE_ENV=development`: падение prerender `/` (`useContext` null) + warning про non-standard `NODE_ENV`.
2. `NODE_ENV=production npm run build -w @coescd/portal-web`: успешная сборка.
3. `npm run build -w @coescd/backend`: успешно.
4. `npm run test:smoke -w @coescd/backend`: успешно (7/7 suites), но логи сильно шумные.
5. `npm run build -w @coescd/gateway`: успешно.
6. `npm run test -w @coescd/gateway`: успешно, но шумные error-логи в ходе тестов.
7. `npm run build -w @coescd/media`: успешно.
8. `npm run test -w @coescd/media`: `No tests found` (проходит из-за `--passWithNoTests`).
9. `npm run lint -w @coescd/backend|gateway|media|map-client`: все падают, т.к. отсутствует ESLint config.
10. `npm run build -w @coescd/field-pwa`: падает (`src/sw.ts:95`, `waitUntil` на типе `Event`).
11. `npm run build -w @coescd/map-client`: проходит, но bundle warning (chunk > 500kb).

## 4) Критичные находки (P0)

### P0-1. Helm vs runtime env: ключевые переменные несовместимы с кодом

Проблема:
- Backend chart задает `OPENSEARCH_HOST/OPENSEARCH_PORT`, но код ожидает `OPENSEARCH_NODE`.
- Backend chart задает `RABBITMQ_HOST/PORT/...`, но backend код в нескольких модулях ожидает именно `RABBITMQ_URL`.
- Media chart задает `ANNOUNCED_IP`, а код ожидает `MEDIASOUP_ANNOUNCED_IP`.

Где:
- `deploy/helm/coescd/templates/backend.yaml:25-28`, `:62-63`
- `apps/backend/src/infra/config/opensearch.config.ts:4`
- `apps/backend/src/infra/events/gateway-events.service.ts:115`
- `apps/backend/src/modules/gateway/services/rabbitmq-gateway.consumer.ts:42`
- `deploy/helm/coescd/templates/media.yaml:66-67`
- `apps/media/src/signaling/signaling-handler.ts:20`

Риск:
- Поиск, event bus и media signaling могут работать некорректно в k8s даже при “успешном” rollout.

Рекомендация:
- Привести naming к единому контракту env vars и покрыть это smoke-тестом chart render + container startup.

---

### P0-2. Ingress маршрутизирует `/map` и `/` в backend, который UI не отдает

Проблема:
- Ingress отправляет `/map` и `/` в backend service.
- Backend имеет глобальный API prefix `api`, и не содержит контроллеров для SPA-страниц.

Где:
- `deploy/helm/coescd/templates/ingress.yaml:69-83`
- `apps/backend/src/main.ts:41`
- `apps/backend/src/health.controller.ts:4`

Риск:
- Неработающий веб-вход в проде (404/неожиданная отдача), ломается пользовательский путь.

Рекомендация:
- Явно деплоить UI-service (portal/map) и маршрутизировать ingress на него.

---

### P0-3. Линтинг в репозитории формально настроен, но фактически неработоспособен

Проблема:
- Скрипты `lint` есть, но конфиг ESLint отсутствует во всех приложениях.

Где:
- `apps/backend/package.json:12`
- `apps/gateway/package.json:9`
- `apps/media/package.json:9`
- `apps/map-client/package.json:10`
- Отсутствуют `.eslintrc*`/`eslint.config.*` в app-папках.

Риск:
- CI quality gate может быть нестабильным/ложным, локально невозможно стандартизованно проверять код.

Рекомендация:
- Ввести единый root `eslint.config.js` (или per-app), зафиксировать правила и запустить autofix baseline.

---

### P0-4. Lockfile рассинхронизирован с workspace-моделью

Проблема:
- Root `package.json` содержит `apps/portal-web` в workspaces.
- Root `package-lock.json` не содержит `apps/portal-web` в workspaces.

Где:
- `package.json:6-13`
- `package-lock.json:10-16`

Риск:
- `npm ci --workspaces` не гарантирует консистентную установку для всех apps.
- Разные среды получают разные dependency trees.

Рекомендация:
- Выбрать один пакетный менеджер для монорепо и регенерировать lockfile в полном соответствии с workspaces.

---

### P0-5. `field-pwa` не собирается

Проблема:
- TypeScript error в service worker (`waitUntil` на `Event`).

Где:
- `apps/field-pwa/src/sw.ts:92-96`

Риск:
- PWA не деплоится/не обновляется через CI.

Рекомендация:
- Типизировать callback `sync` как `SyncEvent` в addEventListener overload или использовать явный type guard.

## 5) Высокий приоритет (P1)

### P1-1. CI/CD логика содержит production-риск

Проблемы:
- CD всегда использует `values.production.yaml`, даже когда выбран `staging`.
- Rollback на revision `0` некорректен.
- В `workflow_run` используется `${GITHUB_SHA::8}` вместо `workflow_run.head_sha`.
- Публикация Docker images не зависит от `helm-lint` job.

Где:
- `.github/workflows/cd.yml:60-67`, `:112-119`, `:42-49`
- `.github/workflows/ci.yml:161`, `:120-145`

Риск:
- Деплой не в ту конфигурацию, rollback не сработает корректно, возможен tag drift.

Рекомендация:
- Разделить deploy paths для staging/production, использовать `github.event.workflow_run.head_sha`, фиксить rollback до “previous successful revision”, сделать `helm-lint` blocking.

---

### P1-2. Токен передается в query string для WebSocket

Проблема:
- `portal-web` формирует `ws://.../ws?token=...`.
- Gateway принимает токен из query.
- Nginx логирует `$request` (включая query).

Где:
- `apps/portal-web/src/components/realtime/usePortalRealtimeRoom.ts:46-48`
- `apps/gateway/src/gateway.ts:64-68`
- `infra/docker/nginx/nginx.conf:33-35`

Риск:
- Утечка bearer token в access logs/monitoring системах.

Рекомендация:
- Перейти на cookie-based auth для ws handshake или ephemeral WS session token (короткоживущий, одноразовый).

---

### P1-3. Ошибки логина/2FA маскируются как “invalid credentials”

Проблема:
- Любая ошибка backend/network в login и MFA flow редуцируется до общего “invalid”.

Где:
- `apps/portal-web/src/app/(public)/login/actions.ts:16-20`
- `apps/portal-web/src/app/(public)/verify-mfa/actions.ts:13-17`, `:29-33`
- `apps/portal-web/src/lib/auth.ts:63-66`

Риск:
- Невозможно быстро диагностировать реальные 500/timeout/back-pressure проблемы.

Рекомендация:
- Развести error classes: auth invalid, auth expired, backend unavailable, rate-limit и т.д.

---

### P1-4. Некорректные HTTP semantics в backend/files

Проблема:
- При отсутствии multipart file бросается `Error`, что уходит в 500.

Где:
- `apps/backend/src/modules/files/controllers/files.controller.ts:69`, `:129`
- `apps/backend/src/infra/filters/global-exception.filter.ts:39-43`

Риск:
- Клиент получает 500 вместо 400, ломается UX и ретраи.

Рекомендация:
- Использовать `BadRequestException` и унифицированный API error contract.

---

### P1-5. CORS origins обрабатываются непоследовательно

Проблема:
- В env origins хранятся CSV-строкой.
- В backend main читаются как `string[]` без split/parsing.
- В realtime gateway split реализован отдельно.

Где:
- `.env.example:95`
- `apps/backend/src/main.ts:58`
- `apps/backend/src/modules/gateway/realtime.gateway.ts:49`

Риск:
- CORS policy работает не так, как ожидается, особенно при множественных origin.

Рекомендация:
- Централизованно парсить `ALLOWED_ORIGINS` в config-layer и переиспользовать.

---

### P1-6. Дублирование realtime-архитектуры (backend gateway + отдельный gateway service)

Проблема:
- В backend включен WsAdapter + `RealtimeGateway`.
- Одновременно существует отдельный `apps/gateway` с собственным ws сервером.
- Это уже привело к bootstrap-ошибке на старте backend.

Где:
- `apps/backend/src/main.ts:25`
- `apps/backend/src/modules/gateway/realtime.gateway.ts:46`
- `apps/gateway/src/main.ts:25`
- `apps/backend/src/modules/gateway/gateway.module.ts:18` (устаревший комментарий)

Риск:
- Конфликт ответственности, дублирование логики, сложность поддержки, регрессии при деплое.

Рекомендация:
- Принять архитектурное решение: один realtime-perimeter (либо в backend, либо отдельный gateway).

---

### P1-7. Ошибки Helm шаблонов backend RBAC/env

Проблема:
- В `backend` Deployment продублирован ключ `envFrom` (YAML key duplication).
- Создан ServiceAccount/RoleBinding для backend, но Deployment не использует `serviceAccountName`.

Где:
- `deploy/helm/coescd/templates/backend.yaml:108-117`
- `deploy/helm/coescd/templates/rbac.yaml:6-48`
- `deploy/helm/coescd/templates/backend.yaml:95-124` (в spec отсутствует `serviceAccountName`)

Риск:
- Неочевидное поведение шаблона, RBAC политика фактически не привязана к pod identity backend.

Рекомендация:
- Убрать дублирование `envFrom`, явно выставить `serviceAccountName` в deployment spec.

## 6) Средний приоритет (P2)

### P2-1. `portal-web` build чувствителен к `NODE_ENV=development` из `.env`

Где:
- `.env.example:5`
- `apps/portal-web/package.json:7-8`

Симптом:
- Build может ломаться с prerender error в dev-окружении, если `NODE_ENV` подтянут из `.env`.

Рекомендация:
- Не хранить `NODE_ENV` в shared `.env` для Next build workflows; задавать его только через окружение процесса CI/CD.

---

### P2-2. Next.js migration debt: `middleware` convention deprecated

Где:
- `apps/portal-web/src/middleware.ts`

Рекомендация:
- Мигрировать на `proxy` convention для Next 16+.

---

### P2-3. `map-client` performance

Симптом:
- Production build показывает chunk > 500kb (maplibre bundle).

Где:
- `apps/map-client/vite.config.ts:31-36`

Рекомендация:
- Aggressive lazy-loading/route splitting для тяжелых map модулей.

---

### P2-4. CI env typo

Проблема:
- В workflow используется `VITE_TILES_URL`, а код читает `VITE_TILE_URL`.

Где:
- `.github/workflows/ci.yml:109`
- `apps/map-client/src/api/client.ts:6`
- `apps/map-client/src/api/gis.ts:19`

Рекомендация:
- Привести переменные к одному имени.

---

### P2-5. ML controller path выбивается из общей схемы versioning

Проблема:
- Указан путь `api/v1/ml` внутри контроллера при уже включенных global prefix/versioning.

Где:
- `apps/backend/src/modules/ml/controllers/ml.controller.ts:31`
- `apps/backend/src/main.ts:41`, `:44`

Риск:
- Непредсказуемый URL (`/api/v1/api/v1/ml`) и инконсистентность API.

Рекомендация:
- Нормализовать controller path до `ml`.

---

### P2-6. Логирование тестов очень шумное

Где:
- `apps/backend` smoke tests (ошибки в логах при passing tests)
- `apps/gateway/src/gateway.spec.ts` (многократные “RabbitMQ connection failed” при passing tests)

Рекомендация:
- Подавлять expected error logs в тестовом окружении (mock logger / log level override).

---

### P2-7. Toolchain drift: смешанные package managers и lockfiles

Проблема:
- В корне одновременно используются `package-lock.json`, `yarn.lock`, `bun.lock`.
- Часть приложений имеет локальные lockfiles, часть — нет.

Где:
- `package-lock.json`
- `yarn.lock`
- `bun.lock`
- `apps/media/package-lock.json`
- `apps/portal-web/package-lock.json`

Риск:
- Невоспроизводимые сборки и различия между локальной средой/CI/production image builds.

Рекомендация:
- Утвердить один package manager + единый lock strategy для монорепо.

---

### P2-8. Health endpoints показывают только “процесс жив”, а не readiness экосистемы

Проблема:
- Health endpoints backend/gateway/media не проверяют доступность ключевых зависимостей (DB/Redis/RabbitMQ/OpenSearch/MinIO).

Где:
- `apps/backend/src/health.controller.ts:7-14`
- `apps/gateway/src/main.ts:10-19`
- `apps/media/src/main.ts:13-25`

Риск:
- Оркестратор может считать сервис “здоровым”, когда бизнес-функции недоступны.

Рекомендация:
- Разделить liveness/readiness и добавить dependency probes.

## 7) UX/UI аудит

### UX-1. Ошибки недостаточно дифференцированы для пользователя

- Пользователь в login/MFA не понимает, это неверный пароль или проблема инфраструктуры.
- Рекомендуется стандартизировать user-facing ошибки с кодами (`AUTH_INVALID`, `MFA_INVALID`, `BACKEND_UNAVAILABLE`, `RATE_LIMITED`).

### UX-2. Сомнительный shortcut “Skip to dashboard”

Где:
- `apps/portal-web/src/app/(public)/login/page.tsx:90-94`

Риск:
- Сбивает пользователей, создает ощущение обхода auth-flow.

### UX-3. Скрытие ошибки как успешного ответа

Где:
- `apps/portal-web/src/app/api/notifications/push-subscription/route.ts:4-10`

Проблема:
- Любая ошибка в `GET` возвращается как `200 []`, что ломает диагностику UI.

## 8) Архитектурные улучшения (как архитектор)

1. Утвердить единую модель realtime (single service boundary).
2. Зафиксировать контракт env variables в одном документе + schema validation на CI.
3. Единый toolchain monorepo (например, только npm или только pnpm/yarn).
4. Выделить “release readiness” pipeline:
   - lint/typecheck/test/build для ВСЕХ apps;
   - image build только после полного green;
   - deploy only with immutable image tag + provenance.
5. Ввести архитектурные decision records (ADRs) по gateway, auth-session model, frontend deployment topology.

## 9) Backend улучшения (как backend engineer)

1. Привести ошибки к typed HttpException (особенно file upload).
2. Унифицировать parsing `ALLOWED_ORIGINS` и другие multi-value env.
3. Расширить `/health` до readiness (db/redis/rabbit/opensearch/minio checks).
4. Убрать hardcoded/stubbed auth constants в ML модуле (`ACTOR_ID`, `USER_CLEARANCE`).
5. Добавить integration tests на startup contracts (env + external deps).

## 10) Frontend улучшения (как frontend engineer)

1. Ввести `lint`/`typecheck`/`test` scripts для `portal-web` и `field-pwa`.
2. Нормализовать обработку API ошибок (перехват 401/403/429/5xx, retry policy, telemetry).
3. Убрать `token` из ws query.
4. Для `field-pwa` исправить SW типизацию и добавить e2e smoke на build.
5. Для `map-client` — lazy chunks и performance budget.

## 11) DevOps/SRE улучшения

1. Починить Helm env contracts (P0-1) и ingress routing (P0-2).
2. Исправить CD workflow логические ошибки (staging/prod split, rollback strategy, head_sha).
3. Включить blocking checks для Helm в image pipeline.
4. Ввести secrets policy (External Secrets + sealed/sops + rotation).
5. Сделать release smoke suite после deploy (API + WS + auth + files + search).

## 12) План внедрения

### 0–72 часа

1. Исправить Helm env mismatch + ingress маршруты.
2. Добавить ESLint config и сделать lint pass для backend/gateway/media/map-client.
3. Исправить `field-pwa` build error.
4. Починить CD rollback и staging path.

### 1–2 недели

1. Устранить lockfile/package-manager drift.
2. Развести auth error classes в `portal-web`.
3. Убрать ws token из query и перейти на ephemeral token flow.
4. Нормализовать health/readiness checks.

### 1–2 месяца

1. Завершить архитектурную консолидацию realtime.
2. Внедрить полный quality gate для всех приложений.
3. Ввести performance budgets и frontend observability (RUM + Sentry-like tracing).

## 13) Быстрые ответы на текущие ошибки из запуска

1. Ошибка Nest `One and only one of "port", "server", or "noServer"`: это конфликт конфигурации WS gateway при использовании `WsAdapter` + `@WebSocketGateway` с самостоятельным портом. Нужно запускать gateway либо на общем HTTP server (`path`), либо как отдельный ws server, но не оба режима одновременно.
2. Ошибка `next start` без `.next`: `start` запускает только production server; перед ним обязательно `next build`.
3. Ошибка `Internal server error` в `src/lib/auth.ts`: текущий код пробрасывает raw backend текст, а upstream ошибки часто маскируются общими catch-блоками — из-за этого UX и диагностика слабые.

---

Если нужно, следующим шагом могу сделать отдельный **implementation plan по файлам** (patch-план на 1 спринт) с конкретными PR-чанками и порядком внедрения.
