"""
CoESCD Spatial Data Ingestion Pipeline (Phase 4.2.2)

DAG ID: coescd_spatial_ingest

Triggered:
  - Automatically when a spatial data file upload is detected via the backend
    API's ingestion job queue (polled every 5 minutes by the scheduler sensor)
  - Manually via Airflow UI or REST API trigger

Pipeline stages (architecture doc §6.2):
  Stage 1 — Format Normalization:   Parse GeoJSON/Shapefile/KML/CSV → canonical GeoDataFrame
  Stage 2 — Quality Validation:     Geometry validity, CRS, bbox, attribute completeness
  Stage 3 — Enrichment:             Admin boundary join, elevation attribute
  Stage 4 — Load to PostGIS:        Upsert into GIS domain tables
  Stage 5 — Notify Backend:         Mark ingestion job complete, publish event

Features quarantined by validation are written to gis.quarantine_records and
surfaced to the data steward via the backend API — they are NOT loaded into the
operational tables.
"""

from __future__ import annotations

import json
import logging
import os
from datetime import datetime, timedelta
from typing import Any

from airflow import DAG
from airflow.operators.python import PythonOperator, ShortCircuitOperator
from airflow.providers.postgres.hooks.postgres import PostgresHook
from airflow.models import Variable

log = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# DAG defaults
# ---------------------------------------------------------------------------
DEFAULT_ARGS = {
    "owner": "coescd-pipelines",
    "retries": 2,
    "retry_delay": timedelta(minutes=3),
    "retry_exponential_backoff": True,
    "max_retry_delay": timedelta(minutes=30),
    "email_on_failure": False,
    "email_on_retry": False,
    "depends_on_past": False,
}

# Airflow Variable keys (set via Airflow UI or environment)
VAR_BACKEND_URL = "coescd_backend_url"
VAR_BACKEND_TOKEN = "coescd_pipeline_service_token"

# Airflow connection IDs (set via docker-compose environment AIRFLOW_CONN_*)
CONN_POSTGRES = "coescd_postgres"

# ---------------------------------------------------------------------------
# Task functions
# ---------------------------------------------------------------------------


def poll_ingestion_jobs(**context) -> list[dict[str, Any]]:
    """
    Poll the CoESCD backend API for pending spatial ingestion jobs.

    Returns the list of pending jobs pushed to XCom.
    Downstream tasks are short-circuited if the queue is empty.
    """
    from coescd.connectors.backend_api import CoESCDBackendClient

    backend_url = Variable.get(VAR_BACKEND_URL, default_var=os.getenv("COESCD_BACKEND_URL", "http://backend:4000"))
    token = Variable.get(VAR_BACKEND_TOKEN, default_var="dev-pipeline-token")

    client = CoESCDBackendClient(base_url=backend_url, service_token=token)
    jobs = client.get_pending_ingestion_jobs()

    log.info("Found %d pending ingestion jobs", len(jobs))
    context["ti"].xcom_push(key="pending_jobs", value=jobs)
    return jobs  # ShortCircuitOperator checks truthiness


def process_ingestion_job(**context) -> None:
    """
    Process each pending ingestion job end-to-end:
    normalize → validate → enrich → load → notify.

    For simplicity this task processes all pending jobs in sequence.
    In high-volume scenarios, use dynamic task mapping (Airflow 2.3+).
    """
    import tempfile
    import requests

    from coescd.validators.spatial_validator import SpatialValidator
    from coescd.validators.attribute_validator import AttributeValidator
    from coescd.transformers.format_normalizer import FormatNormalizer
    from coescd.loaders.postgis_loader import PostGISLoader
    from coescd.connectors.backend_api import CoESCDBackendClient

    backend_url = Variable.get(VAR_BACKEND_URL, default_var=os.getenv("COESCD_BACKEND_URL", "http://backend:4000"))
    token = Variable.get(VAR_BACKEND_TOKEN, default_var="dev-pipeline-token")
    client = CoESCDBackendClient(base_url=backend_url, service_token=token)

    hook = PostgresHook(postgres_conn_id=CONN_POSTGRES)
    loader = PostGISLoader(hook.get_uri())
    normalizer = FormatNormalizer()
    spatial_validator = SpatialValidator()
    attr_validator = AttributeValidator()

    pending_jobs: list[dict] = context["ti"].xcom_pull(key="pending_jobs", task_ids="poll_ingestion_jobs")

    for job in pending_jobs:
        job_id = job["id"]
        layer_type = job.get("layerType", "unknown")
        download_url = job.get("downloadUrl")
        file_name = job.get("fileName", "upload.geojson")
        required_fields = job.get("requiredFields", [])

        log.info("Processing ingestion job %s: layer=%s, file=%s", job_id, layer_type, file_name)

        try:
            # -- Stage 1: Download and normalize format --
            with tempfile.NamedTemporaryFile(suffix=_ext(file_name), delete=False) as tmp:
                tmp_path = tmp.name
                _download_file(download_url, token, tmp_path)

            gdf = normalizer.normalize_file(tmp_path)
            feature_count = len(gdf)
            log.info("Normalized %d features from %s", feature_count, file_name)

            client.publish_ingestion_started(
                pipeline_id=job_id,
                source_file=file_name,
                feature_count=feature_count,
            )

            # -- Stage 2: Quality validation --
            spatial_result = spatial_validator.validate(gdf)
            attr_result = attr_validator.validate(
                gdf,
                required_fields=required_fields,
                timestamp_fields=["timestamp", "date", "event_date", "created_at"],
            )

            all_errors = spatial_result.errors + attr_result.errors
            all_warnings = spatial_result.warnings + attr_result.warnings

            if all_errors:
                client.publish_validation_failure(
                    pipeline_id=job_id, errors=all_errors, warnings=all_warnings
                )

            # Remove quarantined features from the load set
            quarantine_indices = list(
                set(spatial_result.quarantined_indices + attr_result.quarantined_indices)
            )
            quarantine_df = gdf.loc[gdf.index.isin(quarantine_indices)].copy()
            valid_gdf = gdf.drop(index=quarantine_indices, errors="ignore")

            if not quarantine_df.empty:
                _write_quarantine_records(loader, quarantine_df, job_id, all_errors)

            # -- Stage 3: Enrichment --
            valid_gdf = _enrich_with_admin_code(valid_gdf, hook)

            # -- Stage 4: Load to PostGIS --
            target_table = _layer_type_to_table(layer_type)
            rows_loaded = loader.upsert_features(
                gdf=valid_gdf,
                table_name=target_table,
                conflict_columns=["id"] if "id" in valid_gdf.columns else ["geometry"],
            )

            # -- Stage 5: Notify backend --
            client.mark_ingestion_job_complete(
                job_id=job_id,
                rows_loaded=rows_loaded,
                errors=all_errors,
            )
            client.publish_ingestion_complete(
                pipeline_id=job_id,
                rows_loaded=rows_loaded,
                rows_quarantined=len(quarantine_indices),
                rows_repaired=len(spatial_result.repaired_indices),
            )
            log.info(
                "Job %s complete: %d loaded, %d quarantined, %d repaired",
                job_id,
                rows_loaded,
                len(quarantine_indices),
                len(spatial_result.repaired_indices),
            )

        except Exception as exc:
            log.exception("Ingestion job %s failed: %s", job_id, exc)
            client.mark_ingestion_job_failed(job_id=job_id, reason=str(exc))
            # Re-raise to mark Airflow task as failed (triggers retry)
            raise


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _ext(filename: str) -> str:
    return os.path.splitext(filename)[1] or ".geojson"


def _download_file(url: str, token: str, dest_path: str) -> None:
    import requests as req

    with req.get(
        url,
        headers={"Authorization": f"Bearer {token}"},
        stream=True,
        timeout=(5, 120),
    ) as resp:
        resp.raise_for_status()
        with open(dest_path, "wb") as f:
            for chunk in resp.iter_content(chunk_size=65536):
                f.write(chunk)


def _enrich_with_admin_code(gdf, hook):
    """
    Add admin_code column via spatial join against administrative boundaries.
    Falls back gracefully if the boundary table is empty or query fails.
    """
    import geopandas as gpd
    from sqlalchemy import create_engine, text

    if gdf.empty:
        return gdf

    try:
        engine = create_engine(hook.get_uri(), future=True)
        boundaries = gpd.read_postgis(
            "SELECT admin_code, geom FROM gis.administrative_boundaries WHERE level = 3",
            con=engine,
            geom_col="geom",
        )
        if boundaries.empty:
            log.warning("Administrative boundaries table is empty; skipping enrichment")
            return gdf

        boundaries = boundaries.rename(columns={"geom": "geometry"}).set_geometry("geometry")
        enriched = gpd.sjoin(
            gdf,
            boundaries[["admin_code", "geometry"]],
            how="left",
            predicate="within",
        )
        enriched = enriched.drop(columns=["index_right"], errors="ignore")
        return enriched
    except Exception as exc:
        log.warning("Admin code enrichment failed (non-fatal): %s", exc)
        return gdf


def _write_quarantine_records(loader, quarantine_gdf, job_id: str, errors: list[str]) -> None:
    """Persist quarantined records to gis.quarantine_records for data steward review."""
    from sqlalchemy import create_engine, text

    quarantine_gdf = quarantine_gdf.copy()
    quarantine_gdf["pipeline_job_id"] = job_id
    quarantine_gdf["quarantine_reason"] = "; ".join(errors[:5])  # truncate for column width
    quarantine_gdf["quarantined_at"] = datetime.utcnow()

    try:
        loader.bulk_insert(
            gdf=quarantine_gdf,
            table_name="quarantine_records",
            if_exists="append",
        )
    except Exception as exc:
        # Quarantine write failure must not abort the main pipeline
        log.error("Failed to write quarantine records: %s", exc)


def _layer_type_to_table(layer_type: str) -> str:
    mapping = {
        "administrative_boundary": "administrative_boundaries",
        "hazard_zone": "hazard_zones",
        "spatial_feature": "spatial_features",
        "incident_location": "incident_locations",
    }
    return mapping.get(layer_type, "spatial_features")


# ---------------------------------------------------------------------------
# DAG definition
# ---------------------------------------------------------------------------
with DAG(
    dag_id="coescd_spatial_ingest",
    description="Spatial data ingestion pipeline: file upload → normalize → validate → enrich → load",
    default_args=DEFAULT_ARGS,
    schedule="*/5 * * * *",  # Poll every 5 minutes
    start_date=datetime(2026, 1, 1),
    catchup=False,
    max_active_runs=1,
    tags=["coescd", "gis", "ingestion", "phase-4.2"],
    doc_md=__doc__,
) as dag:

    poll_jobs = ShortCircuitOperator(
        task_id="poll_ingestion_jobs",
        python_callable=poll_ingestion_jobs,
    )

    process_jobs = PythonOperator(
        task_id="process_ingestion_jobs",
        python_callable=process_ingestion_job,
    )

    poll_jobs >> process_jobs
