#!/usr/bin/env bash
##############################################################################
# CoESCD Platform — PostgreSQL Restore Script
#
# Usage:
#   ./restore.sh [OPTIONS]
#
# Options:
#   --backup-key    S3 key of the dump file (required)
#                   e.g. daily/coescd_20260406_210000.dump
#                        weekly/coescd_full_20260403_220000.dump
#   --target-db     Target database name (default: coescd)
#   --db-host       PostgreSQL host (default: localhost)
#   --db-port       PostgreSQL port (default: 5432)
#   --db-user       PostgreSQL user (default: coescd)
#   --minio-url     MinIO endpoint (default: http://localhost:9000)
#   --dry-run       Download and validate dump but do NOT restore to DB
#   --list-backups  List available backups in MinIO and exit
#
# Environment variables (override CLI flags):
#   DB_PASSWORD, MINIO_ACCESS_KEY, MINIO_SECRET_KEY
#
# Example — restore latest daily backup:
#   DB_PASSWORD=secret MINIO_ACCESS_KEY=minioadmin MINIO_SECRET_KEY=minioadmin \
#     ./restore.sh --backup-key daily/coescd_20260406_210000.dump
#
# Example — list all available backups:
#   ./restore.sh --list-backups
##############################################################################

set -euo pipefail

# ── Defaults ──────────────────────────────────────────────────────────────────

BACKUP_KEY=""
TARGET_DB="${TARGET_DB:-coescd}"
DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5432}"
DB_USER="${DB_USER:-coescd}"
MINIO_URL="${MINIO_URL:-http://localhost:9000}"
MINIO_BUCKET="coescd-backups"
DRY_RUN=false
LIST_BACKUPS=false

# ── Argument parsing ──────────────────────────────────────────────────────────

while [[ $# -gt 0 ]]; do
  case "$1" in
    --backup-key)    BACKUP_KEY="$2";   shift 2 ;;
    --target-db)     TARGET_DB="$2";    shift 2 ;;
    --db-host)       DB_HOST="$2";      shift 2 ;;
    --db-port)       DB_PORT="$2";      shift 2 ;;
    --db-user)       DB_USER="$2";      shift 2 ;;
    --minio-url)     MINIO_URL="$2";    shift 2 ;;
    --dry-run)       DRY_RUN=true;      shift ;;
    --list-backups)  LIST_BACKUPS=true; shift ;;
    *) echo "Unknown option: $1" >&2; exit 1 ;;
  esac
done

# ── Validate required secrets ─────────────────────────────────────────────────

: "${DB_PASSWORD:?DB_PASSWORD environment variable is required}"
: "${MINIO_ACCESS_KEY:?MINIO_ACCESS_KEY environment variable is required}"
: "${MINIO_SECRET_KEY:?MINIO_SECRET_KEY environment variable is required}"

# ── Check dependencies ────────────────────────────────────────────────────────

for cmd in mc pg_restore psql; do
  if ! command -v "$cmd" &> /dev/null; then
    echo "Error: '$cmd' is not installed or not in PATH" >&2
    exit 1
  fi
done

# ── Configure MinIO client ────────────────────────────────────────────────────

mc alias set minio "${MINIO_URL}" "${MINIO_ACCESS_KEY}" "${MINIO_SECRET_KEY}" --quiet

# ── List backups mode ─────────────────────────────────────────────────────────

if [[ "$LIST_BACKUPS" == "true" ]]; then
  echo "=== Available backups in minio/${MINIO_BUCKET} ==="
  echo ""
  echo "DAILY:"
  mc ls "minio/${MINIO_BUCKET}/daily/" 2>/dev/null | sort -r | head -30 || echo "  (none)"
  echo ""
  echo "WEEKLY:"
  mc ls "minio/${MINIO_BUCKET}/weekly/" 2>/dev/null | sort -r | head -10 || echo "  (none)"
  exit 0
fi

# ── Validate backup key ───────────────────────────────────────────────────────

if [[ -z "$BACKUP_KEY" ]]; then
  echo "Error: --backup-key is required. Use --list-backups to see available dumps." >&2
  exit 1
fi

# ── Pre-flight checks ─────────────────────────────────────────────────────────

echo "╔══════════════════════════════════════════════════════════╗"
echo "║         CoESCD PostgreSQL Restore                       ║"
echo "╚══════════════════════════════════════════════════════════╝"
echo ""
echo "  Backup key:  ${BACKUP_KEY}"
echo "  Target DB:   ${TARGET_DB}@${DB_HOST}:${DB_PORT}"
echo "  Dry-run:     ${DRY_RUN}"
echo ""

if [[ "$DRY_RUN" == "false" ]]; then
  read -r -p "⚠️  This will DROP and recreate '${TARGET_DB}'. Continue? [yes/N] " CONFIRM
  if [[ "$CONFIRM" != "yes" ]]; then
    echo "Aborted."
    exit 0
  fi
fi

# ── Download dump ─────────────────────────────────────────────────────────────

TMPDIR=$(mktemp -d)
LOCAL_DUMP="${TMPDIR}/coescd_restore.dump"
trap 'echo "[cleanup] Removing ${TMPDIR}"; rm -rf "${TMPDIR}"' EXIT

echo "[$(date)] Downloading backup from MinIO..."
mc cp "minio/${MINIO_BUCKET}/${BACKUP_KEY}" "${LOCAL_DUMP}"
echo "[$(date)] Downloaded: $(du -sh "${LOCAL_DUMP}" | cut -f1)"

# ── Validate dump ─────────────────────────────────────────────────────────────

echo "[$(date)] Validating dump integrity..."
if ! pg_restore --list "${LOCAL_DUMP}" > /dev/null; then
  echo "Error: dump file is corrupt or not a valid pg_dump custom format." >&2
  exit 1
fi
OBJECT_COUNT=$(pg_restore --list "${LOCAL_DUMP}" | wc -l)
echo "[$(date)] Dump is valid — ${OBJECT_COUNT} objects."

if [[ "$DRY_RUN" == "true" ]]; then
  echo "[$(date)] Dry-run complete. Backup is valid and downloadable."
  exit 0
fi

# ── Stop application (scale down) ────────────────────────────────────────────

echo "[$(date)] Scaling down backend to prevent writes during restore..."
if command -v kubectl &> /dev/null; then
  kubectl scale deployment coescd-backend --replicas=0 -n coescd 2>/dev/null || \
    echo "  (kubectl not available or deployment not found — continue manually)"
  kubectl scale deployment coescd-gateway --replicas=0 -n coescd 2>/dev/null || true
fi

# ── Drop and recreate target database ────────────────────────────────────────

echo "[$(date)] Dropping existing database '${TARGET_DB}'..."
PGPASSWORD="${DB_PASSWORD}" psql \
  --host="${DB_HOST}" \
  --port="${DB_PORT}" \
  --username="${DB_USER}" \
  --dbname="postgres" \
  --command="SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='${TARGET_DB}' AND pid <> pg_backend_pid();"

PGPASSWORD="${DB_PASSWORD}" psql \
  --host="${DB_HOST}" \
  --port="${DB_PORT}" \
  --username="${DB_USER}" \
  --dbname="postgres" \
  --command="DROP DATABASE IF EXISTS \"${TARGET_DB}\";"

PGPASSWORD="${DB_PASSWORD}" psql \
  --host="${DB_HOST}" \
  --port="${DB_PORT}" \
  --username="${DB_USER}" \
  --dbname="postgres" \
  --command="CREATE DATABASE \"${TARGET_DB}\" OWNER \"${DB_USER}\";"

# Re-enable PostGIS (must be done before restore)
PGPASSWORD="${DB_PASSWORD}" psql \
  --host="${DB_HOST}" \
  --port="${DB_PORT}" \
  --username="${DB_USER}" \
  --dbname="${TARGET_DB}" \
  --command="CREATE EXTENSION IF NOT EXISTS postgis; CREATE EXTENSION IF NOT EXISTS postgis_topology; CREATE EXTENSION IF NOT EXISTS pg_trgm; CREATE EXTENSION IF NOT EXISTS btree_gin;"

echo "[$(date)] Database recreated with extensions."

# ── Restore ───────────────────────────────────────────────────────────────────

echo "[$(date)] Running pg_restore..."
PGPASSWORD="${DB_PASSWORD}" pg_restore \
  --host="${DB_HOST}" \
  --port="${DB_PORT}" \
  --username="${DB_USER}" \
  --dbname="${TARGET_DB}" \
  --format=custom \
  --jobs=4 \
  --no-owner \
  --no-privileges \
  --verbose \
  "${LOCAL_DUMP}" 2>&1 | tail -20

echo "[$(date)] pg_restore complete."

# ── Post-restore validation ───────────────────────────────────────────────────

echo "[$(date)] Validating restored database..."

TABLE_COUNT=$(PGPASSWORD="${DB_PASSWORD}" psql \
  --host="${DB_HOST}" \
  --port="${DB_PORT}" \
  --username="${DB_USER}" \
  --dbname="${TARGET_DB}" \
  --no-align --tuples-only \
  --command="SELECT COUNT(*) FROM information_schema.tables WHERE table_schema NOT IN ('pg_catalog','information_schema');")

echo "[$(date)] Restored ${TABLE_COUNT} tables."

# Quick row-count sanity checks
for SCHEMA_TABLE in "iam.credentials" "org.departments" "tasks.tasks"; do
  ROW_COUNT=$(PGPASSWORD="${DB_PASSWORD}" psql \
    --host="${DB_HOST}" \
    --port="${DB_PORT}" \
    --username="${DB_USER}" \
    --dbname="${TARGET_DB}" \
    --no-align --tuples-only \
    --command="SELECT COUNT(*) FROM ${SCHEMA_TABLE};" 2>/dev/null || echo "N/A")
  echo "  ${SCHEMA_TABLE}: ${ROW_COUNT} rows"
done

# ── Scale back up ─────────────────────────────────────────────────────────────

echo "[$(date)] Scaling backend back up..."
if command -v kubectl &> /dev/null; then
  kubectl scale deployment coescd-backend --replicas=2 -n coescd 2>/dev/null || true
  kubectl scale deployment coescd-gateway --replicas=2 -n coescd 2>/dev/null || true
fi

echo ""
echo "✅ Restore complete. Database '${TARGET_DB}' has been restored from:"
echo "   ${BACKUP_KEY}"
echo ""
echo "Next steps:"
echo "  1. Run TypeORM migrations if restoring to a new schema version:"
echo "     kubectl exec -it deploy/coescd-backend -n coescd -- node dist/infra/database/run-migrations.js"
echo "  2. Verify application health: curl -s https://<host>/api/health"
echo "  3. Refresh materialized views if needed:"
echo "     REFRESH MATERIALIZED VIEW CONCURRENTLY gis.mv_incident_summary_by_region;"
