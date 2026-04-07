# CoESCD Platform

## Local Run

This project uses Docker Compose from the repository root:

```bash
docker compose up -d --build
```

Check container status:

```bash
docker compose ps --all
```

The main `app` stack is healthy when these services are up:

- `postgres`
- `redis`
- `rabbitmq`
- `minio`
- `backend`
- `gateway`
- `map-client`
- `nginx`
- `mailpit`

## Notes About Env

Use the root [`.env`](/Users/aminjon/Desktop/coescd/coes-platform/.env) file for Docker Compose.

Internal infrastructure credentials are namespaced with `COESCD_` to avoid conflicts with shell-level variables such as `POSTGRES_PASSWORD`, `REDIS_PASSWORD`, `RABBITMQ_PASSWORD`, or `MINIO_ROOT_PASSWORD`.

If you need to refresh local defaults:

```bash
cp .env.example .env
```

## Smoke Check

Host-level checks:

```bash
curl -I http://127.0.0.1/
curl http://127.0.0.1:8025/
curl http://127.0.0.1:9002/minio/health/live
curl http://127.0.0.1:9003/
```

Container-level checks:

```bash
docker exec coescd-backend wget -qO- http://127.0.0.1:4000/api/health
docker exec coescd-gateway wget -qO- http://127.0.0.1:4001/health
docker exec coescd-redis redis-cli -a redis_dev ping
docker exec coescd-rabbitmq rabbitmq-diagnostics -q ping
docker exec coescd-minio mc admin info local
```

Expected results:

- `backend` returns JSON with `"status":"ok"`
- `gateway` returns JSON with `"status":"ok"`
- `redis` returns `PONG`
- `rabbitmq` returns `Ping succeeded`
- `minio` health returns `200`

## Reset Persistent Infra Data

If credentials were changed and old Docker volumes still contain previous passwords, recreate the affected volume:

```bash
docker compose down
docker volume rm coescd_postgres-data
docker volume rm coescd_rabbitmq-data
docker compose up -d --build
```

Only remove volumes if you intentionally want to reset local data.

## Backend Migrations

For this project, prefer manual migrations over auto-generated schema diff migrations.

Use:

```bash
cd apps/backend
npm run migration:create -- src/infra/database/migrations/YourMigrationName
```

Then edit the generated file in `src/infra/database/migrations/` and apply it with:

```bash
npm run migration:run
```

For an existing database that already has schemas and tables but an empty `migrations` table, run the baseline once before normal migration runs:

```bash
cd apps/backend
npm run migration:baseline
```

Check current migration status with:

```bash
cd apps/backend
node --require ts-node/register ./node_modules/typeorm/cli.js migration:show -d src/infra/database/data-source.ts
```

Rules:

- Use `migration:run` on a new empty database. The initial migration now creates the required schemas itself.
- Use `migration:baseline` only once for older already-populated databases.
- After baseline, use only `migration:run` and `migration:revert` as usual.

Do not use `migration:generate` for normal work. It is intentionally blocked because the current database schema and TypeORM entities still have remaining naming drift, which can still produce noisy unsafe diffs.

If you explicitly want to inspect a full diff anyway, use:

```bash
npm run migration:diff -- src/infra/database/migrations/SomeName
```

## Backend Seeds

Run seeds only after migrations have been applied:

```bash
cd apps/backend
npm run seed:run
```

The current seed script is idempotent and prepares:

- base departments in `org`
- base positions in `org`
- a default administrator credential in `iam`
- administrator profile and preferences in `users`
- primary position assignment
- `super_admin` and `platform_admin` role assignments

Optional environment variables:

```bash
SEED_ADMIN_USERNAME=superadmin
SEED_ADMIN_EMAIL=superadmin@coescd.local
SEED_ADMIN_PASSWORD=ChangeMe123!
SEED_ADMIN_FIRST_NAME=System
SEED_ADMIN_LAST_NAME=Administrator
SEED_ADMIN_MIDDLE_NAME=
SEED_ADMIN_PHONE=
SEED_FORCE_PASSWORD_RESET=true
```

Notes:

- `SEED_FORCE_PASSWORD_RESET=true` rotates the password for an already existing admin credential.
- The seed expects base authorization roles such as `super_admin` and `platform_admin` to already exist from migrations.

Quick verification:

```bash
psql postgresql://coescd:coescd_dev@localhost:5432/coescd -c "select username, email, status from iam.user_credentials order by created_at desc limit 5;"
psql postgresql://coescd:coescd_dev@localhost:5432/coescd -c "select first_name, last_name, email, status from users.user_profiles order by created_at desc limit 5;"
```
