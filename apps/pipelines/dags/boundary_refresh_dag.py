"""
CoESCD Administrative Boundary Refresh Pipeline (Phase 4.2.3)

DAG ID: coescd_boundary_refresh

Schedule: Weekly (Sunday 02:00 UTC) — boundaries change infrequently

Refreshes the administrative boundary dataset from a configured external
source (GeoJSON file, partner API, or GADM dataset). Only features that
have changed since the last run are updated in PostGIS (change detection
via geometry hash comparison).

After load, the materialized spatial view is refreshed and the Martin
tile server cache is invalidated via HTTP.
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
    "retries": 1,
    "retry_delay": timedelta(minutes=10),
    "email_on_failure": False,
    "email_on_retry": False,
}

VAR_BOUNDARY_SOURCE_URL = "coescd_boundary_source_url"
VAR_BACKEND_URL = "coescd_backend_url"
VAR_BACKEND_TOKEN = "coescd_pipeline_service_token"
VAR_MARTIN_URL = "coescd_martin_url"
CONN_POSTGRES = "coescd_postgres"


# ---------------------------------------------------------------------------
# Task functions
# ---------------------------------------------------------------------------


def fetch_boundary_source(**context) -> int:
    """
    Fetch the latest administrative boundary dataset from the configured source.

    Pushes the GeoJSON dict to XCom for downstream tasks.
    Returns the feature count.
    """
    import requests
    import tempfile

    source_url = Variable.get(
        VAR_BOUNDARY_SOURCE_URL,
        default_var="http://backend:4000/api/gis/boundaries/export?format=geojson",
    )
    token = Variable.get(VAR_BACKEND_TOKEN, default_var="dev-pipeline-token")

    log.info("Fetching boundary dataset from %s", source_url)
    resp = requests.get(
        source_url,
        headers={"Authorization": f"Bearer {token}"},
        timeout=(5, 120),
    )
    resp.raise_for_status()
    geojson = resp.json()

    feature_count = len(geojson.get("features", []))
    log.info("Fetched %d boundary features", feature_count)
    context["ti"].xcom_push(key="boundary_geojson", value=geojson)
    context["ti"].xcom_push(key="feature_count", value=feature_count)
    return feature_count


def validate_boundaries(**context) -> None:
    """Run spatial and attribute validation on the fetched boundary dataset."""
    from coescd.validators.spatial_validator import SpatialValidator
    from coescd.validators.attribute_validator import AttributeValidator
    from coescd.transformers.format_normalizer import FormatNormalizer

    geojson = context["ti"].xcom_pull(key="boundary_geojson", task_ids="fetch_boundary_source")
    if not geojson:
        raise ValueError("No boundary GeoJSON received from fetch task")

    normalizer = FormatNormalizer()
    gdf = normalizer.normalize_geojson_dict(geojson)

    spatial_result = SpatialValidator().validate(gdf)
    attr_result = AttributeValidator().validate(
        gdf,
        required_fields=["admin_code", "name", "level"],
        primary_key=["admin_code"],
    )

    errors = spatial_result.errors + attr_result.errors
    warnings = spatial_result.warnings + attr_result.warnings

    if warnings:
        log.warning("Boundary validation warnings (%d): %s", len(warnings), warnings[:10])

    if errors:
        log.error("Boundary validation errors (%d): %s", len(errors), errors[:20])
        raise ValueError(
            f"Administrative boundary dataset failed validation with {len(errors)} errors. "
            "Aborting refresh to protect operational data integrity."
        )

    log.info("Boundary validation passed (%d features)", len(gdf))
    context["ti"].xcom_push(key="valid_feature_count", value=len(gdf))


def detect_changes(**context) -> dict[str, Any]:
    """
    Compare incoming boundary features against the current database state.

    Uses MD5 hash of WKT geometry + key attributes to detect changes.
    Only changed or new features are marked for upsert.
    """
    import hashlib
    import geopandas as gpd
    from sqlalchemy import create_engine, text
    from coescd.transformers.format_normalizer import FormatNormalizer

    geojson = context["ti"].xcom_pull(key="boundary_geojson", task_ids="fetch_boundary_source")
    normalizer = FormatNormalizer()
    incoming_gdf = normalizer.normalize_geojson_dict(geojson)

    hook = PostgresHook(postgres_conn_id=CONN_POSTGRES)
    engine = create_engine(hook.get_uri(), future=True)

    with engine.connect() as conn:
        existing = conn.execute(
            text("""
                SELECT admin_code,
                       md5(ST_AsText(geom) || COALESCE(name, '') || COALESCE(level::text, ''))
                       AS hash
                FROM gis.administrative_boundaries
            """)
        ).fetchall()

    existing_hashes = {row[0]: row[1] for row in existing}

    def _row_hash(row) -> str:
        wkt = row.geometry.wkt if row.geometry else ""
        content = wkt + str(row.get("name", "")) + str(row.get("level", ""))
        return hashlib.md5(content.encode()).hexdigest()

    incoming_gdf["_hash"] = incoming_gdf.apply(_row_hash, axis=1)
    incoming_gdf["_is_new"] = ~incoming_gdf["admin_code"].isin(existing_hashes)
    incoming_gdf["_is_changed"] = incoming_gdf.apply(
        lambda r: (
            not r["_is_new"]
            and existing_hashes.get(r["admin_code"]) != r["_hash"]
        ),
        axis=1,
    )

    changed_gdf = incoming_gdf[incoming_gdf["_is_new"] | incoming_gdf["_is_changed"]].copy()
    changed_gdf = changed_gdf.drop(columns=["_hash", "_is_new", "_is_changed"])

    new_count = int(incoming_gdf["_is_new"].sum())
    changed_count = int(incoming_gdf["_is_changed"].sum())

    log.info(
        "Change detection: %d new, %d changed of %d total features",
        new_count, changed_count, len(incoming_gdf),
    )

    context["ti"].xcom_push(key="changed_features_geojson", value=changed_gdf.__geo_interface__)
    context["ti"].xcom_push(key="changes_summary", value={"new": new_count, "changed": changed_count})
    return {"new": new_count, "changed": changed_count}


def load_boundaries(**context) -> int:
    """Upsert changed boundary features into PostGIS."""
    import geopandas as gpd
    from coescd.loaders.postgis_loader import PostGISLoader

    changes_summary = context["ti"].xcom_pull(key="changes_summary", task_ids="detect_changes")
    if changes_summary["new"] == 0 and changes_summary["changed"] == 0:
        log.info("No changes detected; skipping load")
        return 0

    changed_geojson = context["ti"].xcom_pull(
        key="changed_features_geojson", task_ids="detect_changes"
    )
    gdf = gpd.GeoDataFrame.from_features(changed_geojson["features"], crs="EPSG:4326")

    hook = PostgresHook(postgres_conn_id=CONN_POSTGRES)
    loader = PostGISLoader(hook.get_uri())

    rows_loaded = loader.upsert_features(
        gdf=gdf,
        table_name="administrative_boundaries",
        conflict_columns=["admin_code"],
    )
    log.info("Loaded %d changed boundary features", rows_loaded)
    return rows_loaded


def refresh_spatial_views(**context) -> None:
    """Refresh PostGIS materialized views after boundary update."""
    from coescd.loaders.postgis_loader import PostGISLoader

    hook = PostgresHook(postgres_conn_id=CONN_POSTGRES)
    loader = PostGISLoader(hook.get_uri())

    # The admin_boundary_stats materialized view is defined in the GIS migration
    loader.refresh_materialized_view("admin_boundary_stats")
    log.info("Spatial materialized views refreshed")


def invalidate_tile_cache(**context) -> None:
    """
    Signal the Martin tile server to drop cached tiles for the boundary layer.

    Martin v0.14 serves tiles on demand without a persistent tile cache, so
    this is a no-op for vector tiles. If a proxy cache (Nginx) is added in
    front of Martin, this task should issue a PURGE request to clear entries
    matching the boundary layer path.
    """
    martin_url = Variable.get(VAR_MARTIN_URL, default_var="http://martin:3002")
    log.info(
        "Tile cache invalidation: Martin at %s serves on-demand tiles; no purge required. "
        "If Nginx proxy_cache is enabled, purge /tiles/administrative_boundaries/* here.",
        martin_url,
    )


# ---------------------------------------------------------------------------
# DAG definition
# ---------------------------------------------------------------------------
with DAG(
    dag_id="coescd_boundary_refresh",
    description="Weekly administrative boundary dataset refresh: fetch → validate → diff → upsert → refresh views",
    default_args=DEFAULT_ARGS,
    schedule="0 2 * * 0",  # Sunday 02:00 UTC — boundaries update infrequently
    start_date=datetime(2026, 1, 1),
    catchup=False,
    max_active_runs=1,
    tags=["coescd", "gis", "boundaries", "scheduled", "phase-4.2"],
    doc_md=__doc__,
) as dag:

    t_fetch = PythonOperator(
        task_id="fetch_boundary_source",
        python_callable=fetch_boundary_source,
    )

    t_validate = PythonOperator(
        task_id="validate_boundaries",
        python_callable=validate_boundaries,
    )

    t_detect = PythonOperator(
        task_id="detect_changes",
        python_callable=detect_changes,
    )

    t_load = PythonOperator(
        task_id="load_boundaries",
        python_callable=load_boundaries,
    )

    t_refresh = PythonOperator(
        task_id="refresh_spatial_views",
        python_callable=refresh_spatial_views,
    )

    t_cache = PythonOperator(
        task_id="invalidate_tile_cache",
        python_callable=invalidate_tile_cache,
    )

    t_fetch >> t_validate >> t_detect >> t_load >> [t_refresh, t_cache]
