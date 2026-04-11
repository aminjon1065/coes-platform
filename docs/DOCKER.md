# Docker Compose — Quick Start Guide

## Prerequisites

- Docker Engine 24+ and Docker Compose v2
- At least 8 GB of RAM allocated to Docker

---

## 1. Set up environment variables

Copy the example file and fill in secrets:

```bash
cp .env.example .env
```

The defaults in `.env.example` work for local development without any changes.
For production, replace every `*_dev` / `*_pass` value with real secrets.

---

## 2. Start containers

The compose file is at `infra/docker/docker-compose.yml` and `.env` is at the project root.
Because they are in different directories, always pass `--env-file .env` — without it Docker
Compose won't find the variables and will fail on required ones like `COESCD_POSTGRES_PASSWORD`.

Run all commands from the **project root**.

### Infra only (recommended for backend development)

Starts PostgreSQL+PostGIS, Redis, RabbitMQ, and MinIO.

```bash
docker compose -f infra/docker/docker-compose.yml --env-file .env up -d
```

### Infra + App

Adds Backend API, WebSocket Gateway, Map Client, Nginx, and ClamAV.

```bash
docker compose -f infra/docker/docker-compose.yml --env-file .env --profile app up -d
```

### With observability (Prometheus, Grafana, Loki, Jaeger)

```bash
docker compose -f infra/docker/docker-compose.yml --env-file .env --profile app --profile obs up -d
```

### Full stack (all profiles)

```bash
docker compose -f infra/docker/docker-compose.yml --env-file .env \
  --profile app \
  --profile obs \
  --profile gis \
  --profile search \
  --profile analytics \
  --profile media \
  --profile pipelines \
  --profile ml \
  up -d
```

---

## 3. Available profiles

| Profile      | Services included                                              |
|--------------|----------------------------------------------------------------|
| *(default)*  | PostgreSQL+PostGIS, Redis, RabbitMQ, MinIO                    |
| `app`        | Backend API, WebSocket Gateway, Map Client, Nginx              |
| `scan`       | ClamAV (x86_64 only — no arm64 image; skip on Apple Silicon)  |
| `obs`        | Prometheus, Grafana, Loki, Alloy, Jaeger, exporters           |
| `media`      | Mediasoup SFU, Coturn TURN/STUN                               |
| `search`     | OpenSearch, OpenSearch Dashboards                              |
| `analytics`  | TimescaleDB                                                    |
| `gis`        | Martin vector tile server, GeoServer                          |
| `pipelines`  | Airflow scheduler, webserver, metadata DB                     |
| `ml`         | ClickHouse, MLflow                                            |

---

## 4. Service ports (localhost only)

| Service               | Port(s)           |
|-----------------------|-------------------|
| PostgreSQL            | 5432              |
| Redis                 | 6379              |
| RabbitMQ              | 5672, 15672 (UI)  |
| MinIO API             | 9002              |
| MinIO Console         | 9001              |
| Backend API           | 4000              |
| Nginx (HTTP)          | 80                |
| Grafana               | 3100              |
| Prometheus            | 9090              |
| Jaeger UI             | 16686             |
| OpenSearch            | 9200              |
| OpenSearch Dashboards | 5601              |
| TimescaleDB           | 5433              |
| Airflow Webserver     | 8080              |
| MLflow                | 5000              |
| ClickHouse HTTP       | 8123              |

---

## 5. Common commands

```bash
# View running containers
docker compose -f infra/docker/docker-compose.yml --env-file .env ps

# Tail logs for a specific service
docker compose -f infra/docker/docker-compose.yml --env-file .env logs -f postgres

# Stop all containers (keep volumes)
docker compose -f infra/docker/docker-compose.yml --env-file .env --profile app --profile obs down

# Stop and remove volumes (DESTRUCTIVE — deletes all data)
docker compose -f infra/docker/docker-compose.yml --env-file .env down -v

# Restart a single service
docker compose -f infra/docker/docker-compose.yml --env-file .env restart redis
```

---

## 6. Credentials (local dev defaults)

| Service    | Username        | Password        |
|------------|-----------------|-----------------|
| PostgreSQL | `coescd`        | `coescd_dev`    |
| Redis      | —               | `redis_dev`     |
| RabbitMQ   | `coescd`        | `rabbit_dev`    |
| MinIO      | `coescd_admin`  | `minio_dev_pass`|
| Grafana    | `admin`         | `observer`      |
| Airflow    | `airflow_admin` | `airflow_admin` |

> Do not use these credentials in production.
