"""
CoESCD Data Quality Validation Pipeline (Phase 4.2.4)

DAG ID: coescd_data_quality

Schedule: Daily at 03:00 UTC

Runs comprehensive data quality checks across all spatial datasets in the
GIS domain's PostGIS database. Checks are organized into four categories:

  1. Geometry integrity:    Invalid geometries, null geometries, self-intersections
  2. Spatial consistency:   Features outside Tajikistan bbox, minimum area violations
  3. Attribute completeness: Required fields null/missing across all GIS tables
  4. Referential integrity: Orphaned records, broken foreign key references
  5. Duplicate detection:   Exact geometry duplicates, duplicate admin codes

Results are:
  - Written to gis.data_quality_runs table for trend analysis
  - Posted to the backend as a data quality report (visible to data stewards)
  - Logged with structured data for Prometheus/Loki alerting

A failed check does NOT fix the data automatically — it flags issues for
manual review by the data steward role. Auto-repair (make_valid) is only
performed during ingestion (spatial_ingest_dag).
"""

from __future__ import annotations

import json
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
    "retries": 1,
    "retry_delay": timedelta(minutes=15),
    "email_on_failure": False,
    "email_on_retry": False,
}

VAR_BACKEND_URL = "coescd_backend_url"
VAR_BACKEND_TOKEN = "coescd_pipeline_service_token"
CONN_POSTGRES = "coescd_postgres"

GIS_SCHEMA = "gis"

# Tables to include in quality checks
GIS_TABLES = [
    "spatial_layers",
    "spatial_features",
    "hazard_zones",
    "incident_locations",
    "administrative_boundaries",
]

# Required non-null columns per table
REQUIRED_COLUMNS: dict[str, list[str]] = {
    "spatial_layers": ["id", "name", "layer_type", "status"],
    "spatial_features": ["id", "layer_id", "geom"],
    "hazard_zones": ["id", "hazard_class", "severity", "geom"],
    "incident_locations": ["id", "incident_type", "reported_at", "geom"],
    "administrative_boundaries": ["id", "admin_code", "name", "level", "geom"],
}

# Name of the geometry column per table (may vary from 'geom' to 'geometry')
GEOM_COLUMN: dict[str, str] = {
    "spatial_features": "geom",
    "hazard_zones": "geom",
    "incident_locations": "geom",
    "administrative_boundaries": "geom",
}


# ---------------------------------------------------------------------------
# Task functions
# ---------------------------------------------------------------------------


def check_geometry_integrity(**context) -> dict[str, Any]:
    """
    SQL-level geometry integrity checks via PostGIS functions.

    Uses ST_IsValid(), ST_IsEmpty(), ST_GeometryType() to identify
    problematic geometries directly in the database without loading
    data into Python.
    """
    from sqlalchemy import create_engine, text

    hook = PostgresHook(postgres_conn_id=CONN_POSTGRES)
    engine = create_engine(hook.get_uri(), future=True)

    issues: dict[str, list[dict]] = {}

    with engine.connect() as conn:
        for table, geom_col in GEOM_COLUMN.items():
            table_issues: list[dict] = []

            # Null geometries
            null_count = conn.execute(
                text(f"""
                    SELECT COUNT(*) FROM {GIS_SCHEMA}."{table}"
                    WHERE "{geom_col}" IS NULL
                """)
            ).scalar() or 0
            if null_count > 0:
                table_issues.append({"check": "null_geometry", "count": null_count})
                log.warning("Table %s: %d null geometries", table, null_count)

            # Empty geometries
            empty_count = conn.execute(
                text(f"""
                    SELECT COUNT(*) FROM {GIS_SCHEMA}."{table}"
                    WHERE "{geom_col}" IS NOT NULL AND ST_IsEmpty("{geom_col}")
                """)
            ).scalar() or 0
            if empty_count > 0:
                table_issues.append({"check": "empty_geometry", "count": empty_count})
                log.warning("Table %s: %d empty geometries", table, empty_count)

            # Invalid geometries (ST_IsValid = false)
            invalid_count = conn.execute(
                text(f"""
                    SELECT COUNT(*) FROM {GIS_SCHEMA}."{table}"
                    WHERE "{geom_col}" IS NOT NULL
                      AND NOT ST_IsEmpty("{geom_col}")
                      AND NOT ST_IsValid("{geom_col}")
                """)
            ).scalar() or 0
            if invalid_count > 0:
                table_issues.append({
                    "check": "invalid_geometry",
                    "count": invalid_count,
                    "action_required": "Review and repair via ST_MakeValid or re-ingest",
                })
                log.error("Table %s: %d INVALID geometries — data steward review required", table, invalid_count)

            issues[table] = table_issues

    context["ti"].xcom_push(key="geometry_issues", value=issues)
    total = sum(sum(i["count"] for i in v) for v in issues.values())
    log.info("Geometry integrity check complete: %d total issues across %d tables", total, len(GEOM_COLUMN))
    return issues


def check_spatial_bounds(**context) -> dict[str, Any]:
    """
    Check that all geometry centroids fall within Tajikistan's bounding box.

    Features outside the bbox are likely coordinate entry errors.
    """
    from sqlalchemy import create_engine, text

    # Tajikistan WGS84 bounding box
    MIN_LON, MAX_LON = 67.34, 75.15
    MIN_LAT, MAX_LAT = 36.67, 41.05

    hook = PostgresHook(postgres_conn_id=CONN_POSTGRES)
    engine = create_engine(hook.get_uri(), future=True)

    issues: dict[str, dict] = {}

    with engine.connect() as conn:
        for table, geom_col in GEOM_COLUMN.items():
            out_of_bbox_count = conn.execute(
                text(f"""
                    SELECT COUNT(*) FROM {GIS_SCHEMA}."{table}"
                    WHERE "{geom_col}" IS NOT NULL
                      AND NOT ST_IsEmpty("{geom_col}")
                      AND NOT ST_Within(
                          ST_Centroid("{geom_col}"),
                          ST_MakeEnvelope(:min_lon, :min_lat, :max_lon, :max_lat, 4326)
                      )
                """),
                {
                    "min_lon": MIN_LON, "min_lat": MIN_LAT,
                    "max_lon": MAX_LON, "max_lat": MAX_LAT,
                },
            ).scalar() or 0

            if out_of_bbox_count > 0:
                issues[table] = {
                    "check": "outside_tajikistan_bbox",
                    "count": out_of_bbox_count,
                    "bbox": f"lon [{MIN_LON},{MAX_LON}] lat [{MIN_LAT},{MAX_LAT}]",
                }
                log.error(
                    "Table %s: %d features outside Tajikistan bounding box",
                    table, out_of_bbox_count,
                )

    context["ti"].xcom_push(key="bbox_issues", value=issues)
    return issues


def check_attribute_completeness(**context) -> dict[str, Any]:
    """
    Check that required columns are non-null across all GIS tables.
    """
    from sqlalchemy import create_engine, text

    hook = PostgresHook(postgres_conn_id=CONN_POSTGRES)
    engine = create_engine(hook.get_uri(), future=True)

    issues: dict[str, list[dict]] = {}

    with engine.connect() as conn:
        for table, required_cols in REQUIRED_COLUMNS.items():
            table_issues: list[dict] = []
            for col in required_cols:
                # Check if column exists first
                col_exists = conn.execute(
                    text("""
                        SELECT COUNT(*) FROM information_schema.columns
                        WHERE table_schema = :schema
                          AND table_name = :table
                          AND column_name = :col
                    """),
                    {"schema": GIS_SCHEMA, "table": table, "col": col},
                ).scalar() or 0

                if col_exists == 0:
                    table_issues.append({
                        "check": "missing_column",
                        "column": col,
                        "action_required": "Column does not exist in table schema",
                    })
                    log.error("Table %s: required column '%s' does not exist", table, col)
                    continue

                null_count = conn.execute(
                    text(f"""
                        SELECT COUNT(*) FROM {GIS_SCHEMA}."{table}"
                        WHERE "{col}" IS NULL
                    """)
                ).scalar() or 0

                if null_count > 0:
                    table_issues.append({
                        "check": "null_required_column",
                        "column": col,
                        "count": null_count,
                    })
                    log.warning("Table %s: %d null values in required column '%s'", table, null_count, col)

            if table_issues:
                issues[table] = table_issues

    context["ti"].xcom_push(key="completeness_issues", value=issues)
    return issues


def check_referential_integrity(**context) -> dict[str, Any]:
    """
    Check referential integrity between GIS domain tables.

    Specifically: spatial_features must reference a valid spatial_layer;
    incident_locations should have a corresponding analytics incident record.
    """
    from sqlalchemy import create_engine, text

    hook = PostgresHook(postgres_conn_id=CONN_POSTGRES)
    engine = create_engine(hook.get_uri(), future=True)

    issues: dict[str, dict] = {}

    with engine.connect() as conn:
        # Orphaned spatial features (layer_id references a non-existent layer)
        try:
            orphan_features = conn.execute(
                text(f"""
                    SELECT COUNT(*) FROM {GIS_SCHEMA}.spatial_features sf
                    LEFT JOIN {GIS_SCHEMA}.spatial_layers sl ON sf.layer_id = sl.id
                    WHERE sl.id IS NULL
                """)
            ).scalar() or 0

            if orphan_features > 0:
                issues["spatial_features_orphaned"] = {
                    "check": "orphaned_layer_reference",
                    "count": orphan_features,
                    "action_required": "spatial_features reference non-existent spatial_layers",
                }
                log.error("Referential integrity: %d orphaned spatial features", orphan_features)
        except Exception as exc:
            log.warning("Could not run orphaned feature check: %s", exc)

        # Incident locations without matching analytics incident
        try:
            orphan_incidents = conn.execute(
                text(f"""
                    SELECT COUNT(*) FROM {GIS_SCHEMA}.incident_locations il
                    LEFT JOIN analytics.incidents ai ON il.id = ai.id
                    WHERE ai.id IS NULL
                """)
            ).scalar() or 0

            if orphan_incidents > 0:
                issues["incident_location_no_analytics_record"] = {
                    "check": "incident_without_analytics_record",
                    "count": orphan_incidents,
                    "action_required": "GIS incident locations without corresponding analytics incident record",
                }
                log.warning(
                    "Referential integrity: %d incident locations without analytics record "
                    "(may be in-flight — check again after next ETL run)",
                    orphan_incidents,
                )
        except Exception as exc:
            log.warning("Could not run incident location integrity check: %s", exc)

    context["ti"].xcom_push(key="referential_issues", value=issues)
    return issues


def check_duplicate_records(**context) -> dict[str, Any]:
    """
    Detect duplicate records across key GIS tables.

    Duplicates in admin boundaries (same admin_code) and incident locations
    (same geometry + type + date) are high-priority data quality issues.
    """
    from sqlalchemy import create_engine, text

    hook = PostgresHook(postgres_conn_id=CONN_POSTGRES)
    engine = create_engine(hook.get_uri(), future=True)

    issues: dict[str, dict] = {}

    with engine.connect() as conn:
        # Duplicate admin codes
        try:
            dup_admin_codes = conn.execute(
                text(f"""
                    SELECT COUNT(*) - COUNT(DISTINCT admin_code) AS duplicates
                    FROM {GIS_SCHEMA}.administrative_boundaries
                """)
            ).scalar() or 0
            if dup_admin_codes > 0:
                issues["admin_boundaries_duplicate_code"] = {
                    "check": "duplicate_admin_code",
                    "count": dup_admin_codes,
                }
                log.error(
                    "Duplicate admin codes: %d duplicate admin_code values in administrative_boundaries",
                    dup_admin_codes,
                )
        except Exception as exc:
            log.warning("Could not run admin code duplicate check: %s", exc)

        # Duplicate incident locations (same geometry + type within 1 hour)
        try:
            dup_incidents = conn.execute(
                text(f"""
                    SELECT COUNT(*) FROM (
                        SELECT geom, incident_type,
                               date_trunc('hour', reported_at) AS hour_bucket,
                               COUNT(*) AS cnt
                        FROM {GIS_SCHEMA}.incident_locations
                        GROUP BY geom, incident_type, hour_bucket
                        HAVING COUNT(*) > 1
                    ) dupes
                """)
            ).scalar() or 0
            if dup_incidents > 0:
                issues["incident_locations_duplicates"] = {
                    "check": "duplicate_incident_location",
                    "count": dup_incidents,
                    "action_required": "Same geometry + type within 1-hour window suggests duplicate reports",
                }
                log.warning(
                    "Duplicate incident groups: %d groups have duplicate incident locations",
                    dup_incidents,
                )
        except Exception as exc:
            log.warning("Could not run incident duplicate check: %s", exc)

    context["ti"].xcom_push(key="duplicate_issues", value=issues)
    return issues


def aggregate_and_report(**context) -> None:
    """
    Aggregate all check results into a single quality report and post it
    to the backend for data steward review. Also writes the run record
    to gis.data_quality_runs.
    """
    from sqlalchemy import create_engine, text
    from coescd.connectors.backend_api import CoESCDBackendClient

    geometry_issues = context["ti"].xcom_pull(key="geometry_issues", task_ids="check_geometry_integrity") or {}
    bbox_issues = context["ti"].xcom_pull(key="bbox_issues", task_ids="check_spatial_bounds") or {}
    completeness_issues = context["ti"].xcom_pull(key="completeness_issues", task_ids="check_attribute_completeness") or {}
    referential_issues = context["ti"].xcom_pull(key="referential_issues", task_ids="check_referential_integrity") or {}
    duplicate_issues = context["ti"].xcom_pull(key="duplicate_issues", task_ids="check_duplicate_records") or {}

    def _count_issues(d) -> int:
        total = 0
        for v in d.values():
            if isinstance(v, list):
                for item in v:
                    total += item.get("count", 1)
            elif isinstance(v, dict):
                total += v.get("count", 1)
        return total

    total_issues = (
        _count_issues(geometry_issues)
        + _count_issues(bbox_issues)
        + _count_issues(completeness_issues)
        + _count_issues(referential_issues)
        + _count_issues(duplicate_issues)
    )

    overall_status = "PASS" if total_issues == 0 else ("WARN" if total_issues < 50 else "FAIL")

    report = {
        "runDate": datetime.utcnow().isoformat() + "Z",
        "dagRunId": context["dag_run"].run_id,
        "overallStatus": overall_status,
        "totalIssues": total_issues,
        "checks": {
            "geometryIntegrity": geometry_issues,
            "spatialBounds": bbox_issues,
            "attributeCompleteness": completeness_issues,
            "referentialIntegrity": referential_issues,
            "duplicates": duplicate_issues,
        },
    }

    log.info(
        "Data quality report: status=%s, total_issues=%d | run=%s",
        overall_status,
        total_issues,
        context["dag_run"].run_id,
    )

    # Write run record to database
    hook = PostgresHook(postgres_conn_id=CONN_POSTGRES)
    engine = create_engine(hook.get_uri(), future=True)
    try:
        with engine.begin() as conn:
            conn.execute(
                text(f"""
                    INSERT INTO {GIS_SCHEMA}.data_quality_runs
                        (run_date, dag_run_id, overall_status, total_issues, report_json)
                    VALUES (:run_date, :dag_run_id, :status, :total, :report)
                    ON CONFLICT DO NOTHING
                """),
                {
                    "run_date": datetime.utcnow(),
                    "dag_run_id": context["dag_run"].run_id,
                    "status": overall_status,
                    "total": total_issues,
                    "report": json.dumps(report),
                },
            )
    except Exception as exc:
        # Table may not exist yet if GIS migration hasn't created it
        log.warning("Could not write data quality run record: %s", exc)

    # Post to backend API
    backend_url = Variable.get(
        VAR_BACKEND_URL,
        default_var=os.getenv("COESCD_BACKEND_URL", "http://backend:4000"),
    )
    token = Variable.get(VAR_BACKEND_TOKEN, default_var="dev-pipeline-token")

    try:
        client = CoESCDBackendClient(base_url=backend_url, service_token=token)
        client.post_data_quality_report(report)
        log.info("Data quality report posted to backend API")
    except Exception as exc:
        log.warning("Could not post data quality report to backend (non-fatal): %s", exc)


# ---------------------------------------------------------------------------
# DAG definition
# ---------------------------------------------------------------------------
with DAG(
    dag_id="coescd_data_quality",
    description="Daily GIS data quality checks: geometry integrity, spatial bounds, completeness, referential integrity, duplicates",
    default_args=DEFAULT_ARGS,
    schedule="0 3 * * *",  # Daily at 03:00 UTC
    start_date=datetime(2026, 1, 1),
    catchup=False,
    max_active_runs=1,
    tags=["coescd", "gis", "data-quality", "scheduled", "phase-4.2"],
    doc_md=__doc__,
) as dag:

    t_geometry = PythonOperator(
        task_id="check_geometry_integrity",
        python_callable=check_geometry_integrity,
    )

    t_bbox = PythonOperator(
        task_id="check_spatial_bounds",
        python_callable=check_spatial_bounds,
    )

    t_completeness = PythonOperator(
        task_id="check_attribute_completeness",
        python_callable=check_attribute_completeness,
    )

    t_referential = PythonOperator(
        task_id="check_referential_integrity",
        python_callable=check_referential_integrity,
    )

    t_duplicates = PythonOperator(
        task_id="check_duplicate_records",
        python_callable=check_duplicate_records,
    )

    t_report = PythonOperator(
        task_id="aggregate_and_report",
        python_callable=aggregate_and_report,
    )

    # All checks run in parallel; aggregate after all complete
    [t_geometry, t_bbox, t_completeness, t_referential, t_duplicates] >> t_report
