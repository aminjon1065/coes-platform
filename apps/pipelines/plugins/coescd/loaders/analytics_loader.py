"""
Analytics store loader for CoESCD pipelines.

Incrementally loads incident records from the operational PostgreSQL database
into the TimescaleDB analytical store. Supports watermark-based incremental
loading to avoid full-table scans on re-runs.
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any

import pandas as pd
from sqlalchemy import create_engine, text

log = logging.getLogger(__name__)

# Schema names
ANALYTICS_SCHEMA = "analytics"
GIS_SCHEMA = "gis"

# Watermark table — stores the last successful load timestamp per pipeline
WATERMARK_TABLE = f"{ANALYTICS_SCHEMA}.pipeline_watermarks"

# Batch size for reads from operational store
BATCH_SIZE = 5_000


class AnalyticsLoader:
    """
    Incremental ETL loader: operational PostgreSQL → TimescaleDB.

    Reads new/updated incident records since the last watermark timestamp
    and appends them to the analytical store's hypertable.

    Args:
        source_conn: SQLAlchemy connection string for the operational DB (main postgres).
        target_conn: SQLAlchemy connection string for TimescaleDB.
    """

    def __init__(self, source_conn: str, target_conn: str) -> None:
        self._source_engine = create_engine(source_conn, future=True)
        self._target_engine = create_engine(target_conn, future=True)

    def run_incident_etl(self, pipeline_id: str = "incident_etl") -> dict[str, Any]:
        """
        Main entry point for incremental incident ETL.

        Returns a summary dict with rows_read, rows_written, watermark.
        """
        watermark = self._get_watermark(pipeline_id)
        log.info(
            "Starting incident ETL (pipeline=%s, watermark=%s)", pipeline_id, watermark
        )

        total_rows_written = 0
        new_watermark = watermark

        for batch in self._read_incidents_since(watermark):
            if batch.empty:
                break
            rows_written = self._write_to_analytical_store(batch)
            total_rows_written += rows_written
            # Track the max updated_at in this batch as the new watermark candidate
            if "updated_at" in batch.columns:
                batch_max = batch["updated_at"].max()
                if pd.notna(batch_max):
                    ts = batch_max.to_pydatetime()
                    if ts.tzinfo is None:
                        ts = ts.replace(tzinfo=timezone.utc)
                    if new_watermark is None or ts > new_watermark:
                        new_watermark = ts

        if new_watermark and new_watermark != watermark:
            self._set_watermark(pipeline_id, new_watermark)

        summary = {
            "pipeline_id": pipeline_id,
            "rows_written": total_rows_written,
            "previous_watermark": watermark.isoformat() if watermark else None,
            "new_watermark": new_watermark.isoformat() if new_watermark else None,
        }
        log.info("Incident ETL complete: %s", summary)
        return summary

    def run_resource_deployment_etl(
        self, pipeline_id: str = "resource_deployment_etl"
    ) -> dict[str, Any]:
        """Incremental ETL for resource deployment records."""
        watermark = self._get_watermark(pipeline_id)
        log.info(
            "Starting resource deployment ETL (pipeline=%s, watermark=%s)",
            pipeline_id,
            watermark,
        )

        total_rows_written = 0
        new_watermark = watermark

        for batch in self._read_resource_deployments_since(watermark):
            if batch.empty:
                break
            rows_written = self._write_resource_deployments(batch)
            total_rows_written += rows_written
            if "updated_at" in batch.columns:
                batch_max = batch["updated_at"].max()
                if pd.notna(batch_max):
                    ts = batch_max.to_pydatetime()
                    if ts.tzinfo is None:
                        ts = ts.replace(tzinfo=timezone.utc)
                    if new_watermark is None or ts > new_watermark:
                        new_watermark = ts

        if new_watermark and new_watermark != watermark:
            self._set_watermark(pipeline_id, new_watermark)

        return {
            "pipeline_id": pipeline_id,
            "rows_written": total_rows_written,
            "new_watermark": new_watermark.isoformat() if new_watermark else None,
        }

    # ------------------------------------------------------------------
    # Source reads (operational PostgreSQL)
    # ------------------------------------------------------------------

    def _read_incidents_since(self, since: datetime | None):
        """Generator yielding batches of incident rows from the operational store."""
        where = (
            f"WHERE updated_at > '{since.isoformat()}'"
            if since
            else ""
        )
        query = f"""
            SELECT
                i.id,
                i.incident_type,
                i.severity,
                i.status,
                i.title,
                i.description,
                i.admin_code,
                i.reported_at,
                i.resolved_at,
                i.created_at,
                i.updated_at,
                -- Response time in seconds (NULL if not yet resolved)
                EXTRACT(EPOCH FROM (i.resolved_at - i.reported_at))::NUMERIC AS response_time_seconds
            FROM {ANALYTICS_SCHEMA}.incidents i
            {where}
            ORDER BY i.updated_at ASC
        """
        yield from self._batch_read(self._source_engine, query)

    def _read_resource_deployments_since(self, since: datetime | None):
        where = (
            f"WHERE updated_at > '{since.isoformat()}'"
            if since
            else ""
        )
        query = f"""
            SELECT
                rd.id,
                rd.incident_id,
                rd.resource_type,
                rd.resource_name,
                rd.quantity,
                rd.unit,
                rd.deployed_at,
                rd.withdrawn_at,
                rd.created_at,
                rd.updated_at,
                EXTRACT(EPOCH FROM (rd.withdrawn_at - rd.deployed_at))::NUMERIC AS deployment_duration_seconds
            FROM {ANALYTICS_SCHEMA}.resource_deployments rd
            {where}
            ORDER BY rd.updated_at ASC
        """
        yield from self._batch_read(self._source_engine, query)

    # ------------------------------------------------------------------
    # Target writes (TimescaleDB)
    # ------------------------------------------------------------------

    def _write_to_analytical_store(self, df: pd.DataFrame) -> int:
        """
        Upsert incident rows into TimescaleDB.
        TimescaleDB hypertables support ON CONFLICT DO UPDATE.
        """
        if df.empty:
            return 0

        cols = list(df.columns)
        col_list = ", ".join(f'"{c}"' for c in cols)
        placeholders = ", ".join([f":{c}" for c in cols])
        update_set = ", ".join(
            f'"{c}" = EXCLUDED."{c}"'
            for c in cols
            if c not in ("id", "reported_at")
        )

        sql = text(f"""
            INSERT INTO {ANALYTICS_SCHEMA}.incidents ({col_list})
            VALUES ({placeholders})
            ON CONFLICT (id) DO UPDATE SET {update_set}
        """)

        with self._target_engine.begin() as conn:
            conn.execute(sql, df.to_dict("records"))
        return len(df)

    def _write_resource_deployments(self, df: pd.DataFrame) -> int:
        if df.empty:
            return 0

        cols = list(df.columns)
        col_list = ", ".join(f'"{c}"' for c in cols)
        placeholders = ", ".join([f":{c}" for c in cols])
        update_set = ", ".join(
            f'"{c}" = EXCLUDED."{c}"'
            for c in cols
            if c not in ("id",)
        )

        sql = text(f"""
            INSERT INTO {ANALYTICS_SCHEMA}.resource_deployments ({col_list})
            VALUES ({placeholders})
            ON CONFLICT (id) DO UPDATE SET {update_set}
        """)

        with self._target_engine.begin() as conn:
            conn.execute(sql, df.to_dict("records"))
        return len(df)

    # ------------------------------------------------------------------
    # Watermark management
    # ------------------------------------------------------------------

    def _ensure_watermark_table(self) -> None:
        with self._target_engine.begin() as conn:
            conn.execute(text(f"""
                CREATE TABLE IF NOT EXISTS {WATERMARK_TABLE} (
                    pipeline_id  TEXT PRIMARY KEY,
                    watermark    TIMESTAMPTZ NOT NULL,
                    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
                )
            """))

    def _get_watermark(self, pipeline_id: str) -> datetime | None:
        self._ensure_watermark_table()
        with self._target_engine.connect() as conn:
            row = conn.execute(
                text(f"SELECT watermark FROM {WATERMARK_TABLE} WHERE pipeline_id = :pid"),
                {"pid": pipeline_id},
            ).fetchone()
        if row:
            wm = row[0]
            if wm.tzinfo is None:
                wm = wm.replace(tzinfo=timezone.utc)
            return wm
        return None

    def _set_watermark(self, pipeline_id: str, ts: datetime) -> None:
        with self._target_engine.begin() as conn:
            conn.execute(
                text(f"""
                    INSERT INTO {WATERMARK_TABLE} (pipeline_id, watermark)
                    VALUES (:pid, :wm)
                    ON CONFLICT (pipeline_id) DO UPDATE
                    SET watermark = EXCLUDED.watermark,
                        updated_at = now()
                """),
                {"pid": pipeline_id, "wm": ts},
            )

    # ------------------------------------------------------------------
    # Batch read helper
    # ------------------------------------------------------------------

    @staticmethod
    def _batch_read(engine, query: str, batch_size: int = BATCH_SIZE):
        offset = 0
        while True:
            paginated = f"{query} LIMIT {batch_size} OFFSET {offset}"
            with engine.connect() as conn:
                df = pd.read_sql(text(paginated), conn)
            if df.empty:
                return
            yield df
            if len(df) < batch_size:
                return
            offset += batch_size
