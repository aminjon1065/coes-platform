"""
CoESCD Analytics ETL Pipeline (Phase 4.2.3)

DAG ID: coescd_analytics_etl

Schedule: Every 15 minutes — near-real-time analytical store sync

Incrementally moves new/updated records from the operational PostgreSQL
database (analytics schema) into the TimescaleDB analytical store.

Pipelines run in this DAG:
  1. incident_etl:              incidents → TimescaleDB hypertable
  2. resource_deployment_etl:  resource_deployments → TimescaleDB

Uses watermark-based incremental loading: only records updated since the
last successful run are transferred. Watermarks are stored in TimescaleDB
itself (analytics.pipeline_watermarks table).

After each ETL run the TimescaleDB continuous aggregate policies are
triggered to refresh materialized rollups.
"""

from __future__ import annotations

import logging
import os
from datetime import datetime, timedelta
from typing import Any

from airflow import DAG
from airflow.operators.python import PythonOperator
from airflow.providers.postgres.hooks.postgres import PostgresHook
from airflow.models import Variable

log = logging.getLogger(__name__)

DEFAULT_ARGS = {
    "owner": "coescd-pipelines",
    "retries": 3,
    "retry_delay": timedelta(minutes=2),
    "retry_exponential_backoff": True,
    "max_retry_delay": timedelta(minutes=15),
    "email_on_failure": False,
    "email_on_retry": False,
}

CONN_POSTGRES = "coescd_postgres"
CONN_TIMESCALE = "coescd_timescale"


# ---------------------------------------------------------------------------
# Task functions
# ---------------------------------------------------------------------------


def run_incident_etl(**context) -> dict[str, Any]:
    """Incremental incident ETL: operational PostgreSQL → TimescaleDB."""
    from coescd.loaders.analytics_loader import AnalyticsLoader

    hook_src = PostgresHook(postgres_conn_id=CONN_POSTGRES)
    hook_tgt = PostgresHook(postgres_conn_id=CONN_TIMESCALE)

    loader = AnalyticsLoader(
        source_conn=hook_src.get_uri(),
        target_conn=hook_tgt.get_uri(),
    )
    summary = loader.run_incident_etl(pipeline_id="incident_etl")
    log.info("Incident ETL summary: %s", summary)
    context["ti"].xcom_push(key="incident_etl_summary", value=summary)
    return summary


def run_resource_deployment_etl(**context) -> dict[str, Any]:
    """Incremental resource deployment ETL: operational PostgreSQL → TimescaleDB."""
    from coescd.loaders.analytics_loader import AnalyticsLoader

    hook_src = PostgresHook(postgres_conn_id=CONN_POSTGRES)
    hook_tgt = PostgresHook(postgres_conn_id=CONN_TIMESCALE)

    loader = AnalyticsLoader(
        source_conn=hook_src.get_uri(),
        target_conn=hook_tgt.get_uri(),
    )
    summary = loader.run_resource_deployment_etl(pipeline_id="resource_deployment_etl")
    log.info("Resource deployment ETL summary: %s", summary)
    context["ti"].xcom_push(key="resource_etl_summary", value=summary)
    return summary


def refresh_continuous_aggregates(**context) -> None:
    """
    Trigger TimescaleDB continuous aggregate policy refresh.

    TimescaleDB runs continuous aggregate policies automatically on its own
    schedule, but after a bulk ETL load we explicitly call
    refresh_continuous_aggregate() to ensure the analytical rollups are
    up-to-date before the next dashboard query.
    """
    from sqlalchemy import create_engine, text

    hook = PostgresHook(postgres_conn_id=CONN_TIMESCALE)
    engine = create_engine(hook.get_uri(), future=True)

    # Refresh the last 48 hours of data in the hourly and daily rollup views.
    # Adjust the window as data latency requirements change.
    refresh_window_start = datetime.utcnow() - timedelta(hours=48)
    refresh_window_end = datetime.utcnow()

    continuous_aggregates = [
        "analytics.incidents_hourly",
        "analytics.incidents_daily",
        "analytics.response_time_hourly",
    ]

    with engine.begin() as conn:
        for cagg in continuous_aggregates:
            try:
                conn.execute(
                    text(
                        f"CALL refresh_continuous_aggregate('{cagg}', :start, :end)"
                    ),
                    {"start": refresh_window_start, "end": refresh_window_end},
                )
                log.info("Refreshed continuous aggregate: %s", cagg)
            except Exception as exc:
                # Non-fatal: the continuous aggregate may not exist yet
                # (created in Phase 5 when TimescaleDB separation is complete)
                log.warning(
                    "Could not refresh continuous aggregate '%s': %s (non-fatal)", cagg, exc
                )


def log_etl_run_summary(**context) -> None:
    """Log a structured summary of the ETL run for observability."""
    incident_summary = context["ti"].xcom_pull(
        key="incident_etl_summary", task_ids="run_incident_etl"
    )
    resource_summary = context["ti"].xcom_pull(
        key="resource_etl_summary", task_ids="run_resource_deployment_etl"
    )

    total_rows = (incident_summary or {}).get("rows_written", 0) + \
                 (resource_summary or {}).get("rows_written", 0)

    log.info(
        "ETL run complete | dag_run=%s | total_rows_written=%d | "
        "incidents=%s | resources=%s",
        context["dag_run"].run_id,
        total_rows,
        incident_summary,
        resource_summary,
    )


# ---------------------------------------------------------------------------
# DAG definition
# ---------------------------------------------------------------------------
with DAG(
    dag_id="coescd_analytics_etl",
    description="15-minute incremental ETL: operational PostgreSQL → TimescaleDB analytical store",
    default_args=DEFAULT_ARGS,
    schedule="*/15 * * * *",  # Every 15 minutes
    start_date=datetime(2026, 1, 1),
    catchup=False,
    max_active_runs=1,  # Prevent overlapping ETL runs
    tags=["coescd", "analytics", "etl", "scheduled", "phase-4.2"],
    doc_md=__doc__,
) as dag:

    t_incident_etl = PythonOperator(
        task_id="run_incident_etl",
        python_callable=run_incident_etl,
    )

    t_resource_etl = PythonOperator(
        task_id="run_resource_deployment_etl",
        python_callable=run_resource_deployment_etl,
    )

    t_refresh_cagg = PythonOperator(
        task_id="refresh_continuous_aggregates",
        python_callable=refresh_continuous_aggregates,
    )

    t_summary = PythonOperator(
        task_id="log_etl_run_summary",
        python_callable=log_etl_run_summary,
    )

    # Both ETL tasks run in parallel; refresh aggregates after both complete
    [t_incident_etl, t_resource_etl] >> t_refresh_cagg >> t_summary
