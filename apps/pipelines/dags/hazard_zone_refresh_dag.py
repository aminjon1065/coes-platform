"""
CoESCD Hazard Zone Refresh Pipeline (Phase 4.2.3)

DAG ID: coescd_hazard_zone_refresh

Schedule: Hourly — hazard zones are updated after analysis runs

Fetches the latest hazard zone boundaries from the analytics pipeline
outputs and updates the PostGIS hazard_zones table. Supports four
hazard classes: FLOOD, LANDSLIDE, SEISMIC, WILDFIRE.

Each hazard class can have an independent source (different endpoints
for flood zone analysis vs. seismic hazard maps) — configured via
Airflow Variables per hazard class.

After load, triggers an event on the CoESCD backend so that the
real-time GIS map displays the updated hazard boundaries.
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
    "retries": 2,
    "retry_delay": timedelta(minutes=5),
    "email_on_failure": False,
    "email_on_retry": False,
}

# Hazard class definitions — maps to hazard_zone.hazard_class enum in the GIS domain
HAZARD_CLASSES = ["FLOOD", "LANDSLIDE", "SEISMIC", "WILDFIRE"]

VAR_BACKEND_URL = "coescd_backend_url"
VAR_BACKEND_TOKEN = "coescd_pipeline_service_token"
CONN_POSTGRES = "coescd_postgres"


# ---------------------------------------------------------------------------
# Task functions
# ---------------------------------------------------------------------------


def fetch_hazard_zones(**context) -> dict[str, int]:
    """
    Fetch updated hazard zone boundaries for all hazard classes from the backend.

    Each hazard class has a dedicated API endpoint that returns the latest
    analysis-derived zone boundaries. Results are pushed to XCom per class.
    """
    import requests

    backend_url = Variable.get(
        VAR_BACKEND_URL,
        default_var=os.getenv("COESCD_BACKEND_URL", "http://backend:4000"),
    )
    token = Variable.get(VAR_BACKEND_TOKEN, default_var="dev-pipeline-token")

    headers = {"Authorization": f"Bearer {token}"}
    counts: dict[str, int] = {}

    for hazard_class in HAZARD_CLASSES:
        url = f"{backend_url}/api/gis/hazard-zones/export?hazardClass={hazard_class}&format=geojson"
        log.info("Fetching %s hazard zones from %s", hazard_class, url)

        try:
            resp = requests.get(url, headers=headers, timeout=(5, 60))
            resp.raise_for_status()
            geojson = resp.json()
            feature_count = len(geojson.get("features", []))
            counts[hazard_class] = feature_count

            context["ti"].xcom_push(
                key=f"hazard_geojson_{hazard_class.lower()}", value=geojson
            )
            log.info("Fetched %d %s hazard zones", feature_count, hazard_class)

        except Exception as exc:
            log.warning(
                "Could not fetch %s hazard zones (non-fatal — will skip this class): %s",
                hazard_class,
                exc,
            )
            counts[hazard_class] = 0

    context["ti"].xcom_push(key="fetch_counts", value=counts)
    return counts


def validate_hazard_zones(**context) -> None:
    """Validate spatial quality for all fetched hazard zone datasets."""
    import geopandas as gpd
    from coescd.validators.spatial_validator import SpatialValidator
    from coescd.validators.attribute_validator import AttributeValidator
    from coescd.transformers.format_normalizer import FormatNormalizer

    normalizer = FormatNormalizer()
    spatial_validator = SpatialValidator()
    attr_validator = AttributeValidator()

    for hazard_class in HAZARD_CLASSES:
        geojson = context["ti"].xcom_pull(
            key=f"hazard_geojson_{hazard_class.lower()}",
            task_ids="fetch_hazard_zones",
        )
        if not geojson or not geojson.get("features"):
            log.info("No %s hazard zone features; skipping validation", hazard_class)
            continue

        gdf = normalizer.normalize_geojson_dict(geojson)

        spatial_result = spatial_validator.validate(gdf)
        attr_result = attr_validator.validate(
            gdf,
            required_fields=["hazard_class", "severity"],
            primary_key=["id"] if "id" in gdf.columns else None,
        )

        errors = spatial_result.errors + attr_result.errors
        warnings = spatial_result.warnings + attr_result.warnings

        if warnings:
            log.warning(
                "%s hazard zone validation warnings (%d): %s",
                hazard_class, len(warnings), warnings[:5],
            )
        if errors:
            # Log errors but don't abort — quarantine bad features and continue
            log.error(
                "%s hazard zone validation errors (%d): %s",
                hazard_class, len(errors), errors[:10],
            )

        context["ti"].xcom_push(
            key=f"validation_errors_{hazard_class.lower()}",
            value={"errors": errors, "warnings": warnings},
        )


def load_hazard_zones(**context) -> dict[str, int]:
    """
    Upsert validated hazard zone features into PostGIS for all hazard classes.

    Quarantined features (failed validation) are excluded from the upsert.
    """
    import geopandas as gpd
    from coescd.validators.spatial_validator import SpatialValidator
    from coescd.transformers.format_normalizer import FormatNormalizer
    from coescd.loaders.postgis_loader import PostGISLoader

    hook = PostgresHook(postgres_conn_id=CONN_POSTGRES)
    loader = PostGISLoader(hook.get_uri())
    normalizer = FormatNormalizer()
    spatial_validator = SpatialValidator()

    rows_loaded: dict[str, int] = {}

    for hazard_class in HAZARD_CLASSES:
        geojson = context["ti"].xcom_pull(
            key=f"hazard_geojson_{hazard_class.lower()}",
            task_ids="fetch_hazard_zones",
        )
        if not geojson or not geojson.get("features"):
            rows_loaded[hazard_class] = 0
            continue

        gdf = normalizer.normalize_geojson_dict(geojson)

        # Re-run spatial validation to get quarantine indices
        spatial_result = spatial_validator.validate(gdf)
        valid_gdf = gdf.drop(index=spatial_result.quarantined_indices, errors="ignore")

        if valid_gdf.empty:
            log.warning("All %s hazard zone features quarantined; nothing to load", hazard_class)
            rows_loaded[hazard_class] = 0
            continue

        # Ensure hazard_class attribute is set (in case the source omits it)
        valid_gdf["hazard_class"] = hazard_class

        conflict_cols = ["id"] if "id" in valid_gdf.columns else ["hazard_class", "geometry"]
        n = loader.upsert_features(
            gdf=valid_gdf,
            table_name="hazard_zones",
            conflict_columns=conflict_cols,
        )
        rows_loaded[hazard_class] = n
        log.info("Loaded %d %s hazard zones", n, hazard_class)

    context["ti"].xcom_push(key="load_summary", value=rows_loaded)
    return rows_loaded


def publish_hazard_update_event(**context) -> None:
    """
    Publish a gis.hazard_zones_updated event to the backend so connected
    map clients receive a push notification and refresh the hazard layer.
    """
    from coescd.connectors.backend_api import CoESCDBackendClient

    backend_url = Variable.get(
        VAR_BACKEND_URL,
        default_var=os.getenv("COESCD_BACKEND_URL", "http://backend:4000"),
    )
    token = Variable.get(VAR_BACKEND_TOKEN, default_var="dev-pipeline-token")
    load_summary = context["ti"].xcom_pull(key="load_summary", task_ids="load_hazard_zones")

    total_loaded = sum(load_summary.values()) if load_summary else 0
    if total_loaded == 0:
        log.info("No hazard zones updated; skipping event publication")
        return

    client = CoESCDBackendClient(base_url=backend_url, service_token=token)
    client._post(
        "/api/pipeline/events",
        {
            "event": "gis.hazard_zones_updated",
            "loadSummary": load_summary,
            "updatedAt": datetime.utcnow().isoformat() + "Z",
        },
    )
    log.info("Published hazard zones update event: %s", load_summary)


# ---------------------------------------------------------------------------
# DAG definition
# ---------------------------------------------------------------------------
with DAG(
    dag_id="coescd_hazard_zone_refresh",
    description="Hourly hazard zone refresh: fetch analysis outputs → validate → upsert PostGIS → notify",
    default_args=DEFAULT_ARGS,
    schedule="0 * * * *",  # Every hour
    start_date=datetime(2026, 1, 1),
    catchup=False,
    max_active_runs=1,
    tags=["coescd", "gis", "hazards", "scheduled", "phase-4.2"],
    doc_md=__doc__,
) as dag:

    t_fetch = PythonOperator(
        task_id="fetch_hazard_zones",
        python_callable=fetch_hazard_zones,
    )

    t_validate = PythonOperator(
        task_id="validate_hazard_zones",
        python_callable=validate_hazard_zones,
    )

    t_load = PythonOperator(
        task_id="load_hazard_zones",
        python_callable=load_hazard_zones,
    )

    t_notify = PythonOperator(
        task_id="publish_hazard_update_event",
        python_callable=publish_hazard_update_event,
    )

    t_fetch >> t_validate >> t_load >> t_notify
