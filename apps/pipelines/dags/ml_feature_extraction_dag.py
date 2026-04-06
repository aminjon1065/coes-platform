"""
DAG: coescd_ml_feature_extraction
Schedule: Every 30 minutes

Extracts and materialises ML features for all four hazard models from the
CoESCD data sources (GIS + Analytics + Weather stub) into ClickHouse.

Feature families computed per admin-boundary unit:
  - Hydro features    → flood model
  - Terrain features  → landslide model
  - Seismic features  → seismic model
  - Vegetation/weather → wildfire model
"""
from __future__ import annotations

import json
import logging
from datetime import datetime, timedelta, timezone

from airflow import DAG
from airflow.operators.python import PythonOperator
from airflow.models import Variable

log = logging.getLogger(__name__)

# ── Constants ──────────────────────────────────────────────────────────────────

ADMIN_LEVELS   = [1, 2, 3]    # national → oblast → rayon
HAZARD_TYPES   = ['flood', 'landslide', 'seismic', 'wildfire']
BATCH_SIZE     = 500

CLICKHOUSE_DB  = 'coescd_ml'
FEATURES_TABLE = 'feature_snapshots'

DEFAULT_ARGS = {
    'owner':            'coescd-ml',
    'depends_on_past':  False,
    'retries':          2,
    'retry_delay':      timedelta(minutes=3),
    'execution_timeout': timedelta(minutes=20),
}

# ── Feature extraction helpers ─────────────────────────────────────────────────

def _get_pg_conn():
    from airflow.hooks.base import BaseHook
    from sqlalchemy import create_engine
    conn = BaseHook.get_connection('coescd_postgres')
    url = f"postgresql+psycopg2://{conn.login}:{conn.password}@{conn.host}:{conn.port}/{conn.schema}"
    return create_engine(url, pool_pre_ping=True)


def _get_ch_client():
    """Returns a ClickHouse HTTP client via clickhouse-driver."""
    from clickhouse_driver import Client
    from airflow.hooks.base import BaseHook
    conn = BaseHook.get_connection('coescd_clickhouse')
    return Client(
        host=conn.host,
        port=9000,
        database=CLICKHOUSE_DB,
        user=conn.login,
        password=conn.password,
    )


def ensure_clickhouse_schema(**_):
    """Create ClickHouse tables if they don't exist (idempotent)."""
    ch = _get_ch_client()

    # Main feature snapshot table — MergeTree partitioned by month + hazard
    ch.execute(f"""
        CREATE TABLE IF NOT EXISTS {CLICKHOUSE_DB}.{FEATURES_TABLE} (
            snapshot_ts         DateTime,
            hazard_type         LowCardinality(String),
            admin_code          String,
            admin_level         UInt8,
            -- Hydro / Flood features
            precip_7d_mm        Float32 DEFAULT 0,
            precip_30d_mm       Float32 DEFAULT 0,
            river_stage_m       Float32 DEFAULT 0,
            flood_freq_5yr      UInt16 DEFAULT 0,
            drainage_density    Float32 DEFAULT 0,
            -- Terrain / Landslide features
            slope_mean_deg      Float32 DEFAULT 0,
            slope_max_deg       Float32 DEFAULT 0,
            elevation_mean_m    Float32 DEFAULT 0,
            curvature_mean      Float32 DEFAULT 0,
            lithology_code      UInt8 DEFAULT 0,
            soil_saturation_pct Float32 DEFAULT 0,
            -- Seismic features
            peak_ground_acc_g   Float32 DEFAULT 0,
            fault_distance_km   Float32 DEFAULT 0,
            magnitude_max_30d   Float32 DEFAULT 0,
            seismic_zone_code   UInt8 DEFAULT 0,
            -- Wildfire features
            ndvi_mean           Float32 DEFAULT 0,
            temp_max_7d_c       Float32 DEFAULT 0,
            wind_speed_ms       Float32 DEFAULT 0,
            fire_weather_index  Float32 DEFAULT 0,
            -- Incident history (shared)
            incident_count_90d  UInt16 DEFAULT 0,
            incident_count_365d UInt16 DEFAULT 0,
            population_density  Float32 DEFAULT 0,
            -- Metadata
            data_quality_score  Float32 DEFAULT 1.0,
            feature_hash        String DEFAULT ''
        )
        ENGINE = MergeTree()
        PARTITION BY (toYYYYMM(snapshot_ts), hazard_type)
        ORDER BY (snapshot_ts, admin_code)
        TTL snapshot_ts + INTERVAL 12 MONTH
        SETTINGS index_granularity = 8192
    """)

    # Latest-features materialised view for fast serving
    ch.execute(f"""
        CREATE MATERIALIZED VIEW IF NOT EXISTS {CLICKHOUSE_DB}.latest_features
        ENGINE = ReplacingMergeTree(snapshot_ts)
        ORDER BY (hazard_type, admin_code)
        AS SELECT * FROM {CLICKHOUSE_DB}.{FEATURES_TABLE}
    """)
    log.info("ClickHouse schema ready")


def extract_hydro_features(ds_nodash: str, **_) -> int:
    """Extract precipitation, river stage, and flood history for flood model."""
    import pandas as pd
    import hashlib

    pg    = _get_pg_conn()
    ch    = _get_ch_client()
    snap  = datetime.now(tz=timezone.utc).replace(second=0, microsecond=0)
    count = 0

    query = """
        SELECT
            ab.administrative_code                                          AS admin_code,
            ab.level                                                        AS admin_level,
            COALESCE(SUM(CASE WHEN il.reported_at >= NOW() - INTERVAL '7 days'
                              THEN 1 END), 0)                               AS incident_count_7d,
            COALESCE(SUM(CASE WHEN il.reported_at >= NOW() - INTERVAL '90 days'
                              THEN 1 END), 0)                               AS incident_count_90d,
            COALESCE(SUM(CASE WHEN il.reported_at >= NOW() - INTERVAL '365 days'
                              THEN 1 END), 0)                               AS incident_count_365d,
            COALESCE(AVG(ab.attributes->>'population_density')::FLOAT, 0)  AS population_density
        FROM gis.administrative_boundaries ab
        LEFT JOIN gis.incident_locations il
            ON ST_Within(il.location::geometry, ab.boundary::geometry)
           AND il.hazard_type = 'FLOOD'
        WHERE ab.level = ANY(ARRAY[1,2,3])
        GROUP BY ab.administrative_code, ab.level
        ORDER BY ab.administrative_code
    """

    df = pd.read_sql(query, pg)
    if df.empty:
        log.warning("No hydro feature rows returned — skipping")
        return 0

    rows = []
    for _, row in df.iterrows():
        feature_hash = hashlib.md5(
            f"flood|{row.admin_code}|{snap.isoformat()}".encode()
        ).hexdigest()[:16]
        rows.append({
            'snapshot_ts':        snap,
            'hazard_type':        'flood',
            'admin_code':         row.admin_code,
            'admin_level':        int(row.admin_level),
            'precip_7d_mm':       float(row.get('precip_7d_mm', 0) or 0),
            'precip_30d_mm':      float(row.get('precip_30d_mm', 0) or 0),
            'river_stage_m':      0.0,  # from weather stub — TODO
            'flood_freq_5yr':     int(row.incident_count_90d),
            'drainage_density':   0.0,
            'incident_count_90d': int(row.incident_count_90d),
            'incident_count_365d': int(row.incident_count_365d),
            'population_density': float(row.population_density or 0),
            'data_quality_score': 0.9,
            'feature_hash':       feature_hash,
        })

    if rows:
        ch.execute(
            f"INSERT INTO {CLICKHOUSE_DB}.{FEATURES_TABLE} VALUES",
            rows,
        )
        count = len(rows)
        log.info(f"Inserted {count} hydro feature rows")

    return count


def extract_terrain_features(ds_nodash: str, **_) -> int:
    """Extract slope, elevation, soil data for landslide model."""
    import pandas as pd
    import hashlib

    pg    = _get_pg_conn()
    ch    = _get_ch_client()
    snap  = datetime.now(tz=timezone.utc).replace(second=0, microsecond=0)

    query = """
        SELECT
            ab.administrative_code   AS admin_code,
            ab.level                 AS admin_level,
            COALESCE((ab.attributes->>'slope_mean_deg')::FLOAT,   12.0) AS slope_mean_deg,
            COALESCE((ab.attributes->>'slope_max_deg')::FLOAT,    35.0) AS slope_max_deg,
            COALESCE((ab.attributes->>'elevation_mean_m')::FLOAT, 1500) AS elevation_mean_m,
            COALESCE((ab.attributes->>'curvature_mean')::FLOAT,   0.0)  AS curvature_mean,
            COALESCE((ab.attributes->>'lithology_code')::INT,     1)    AS lithology_code,
            COALESCE((ab.attributes->>'population_density')::FLOAT, 0)  AS population_density,
            COALESCE(SUM(CASE WHEN il.reported_at >= NOW() - INTERVAL '90 days'
                              THEN 1 END), 0) AS incident_count_90d,
            COALESCE(SUM(CASE WHEN il.reported_at >= NOW() - INTERVAL '365 days'
                              THEN 1 END), 0) AS incident_count_365d
        FROM gis.administrative_boundaries ab
        LEFT JOIN gis.incident_locations il
            ON ST_Within(il.location::geometry, ab.boundary::geometry)
           AND il.hazard_type = 'LANDSLIDE'
        WHERE ab.level = ANY(ARRAY[1,2,3])
        GROUP BY ab.administrative_code, ab.level, ab.attributes
        ORDER BY ab.administrative_code
    """

    df = pd.read_sql(query, pg)
    if df.empty:
        return 0

    rows = []
    for _, row in df.iterrows():
        rows.append({
            'snapshot_ts':         snap,
            'hazard_type':         'landslide',
            'admin_code':          row.admin_code,
            'admin_level':         int(row.admin_level),
            'slope_mean_deg':      float(row.slope_mean_deg),
            'slope_max_deg':       float(row.slope_max_deg),
            'elevation_mean_m':    float(row.elevation_mean_m),
            'curvature_mean':      float(row.curvature_mean),
            'lithology_code':      int(row.lithology_code),
            'soil_saturation_pct': 0.0,  # from weather feed — TODO
            'incident_count_90d':  int(row.incident_count_90d),
            'incident_count_365d': int(row.incident_count_365d),
            'population_density':  float(row.population_density or 0),
            'data_quality_score':  0.85,
            'feature_hash':        hashlib.md5(
                f"landslide|{row.admin_code}|{snap.isoformat()}".encode()
            ).hexdigest()[:16],
        })

    if rows:
        ch.execute(f"INSERT INTO {CLICKHOUSE_DB}.{FEATURES_TABLE} VALUES", rows)
        log.info(f"Inserted {len(rows)} terrain feature rows")

    return len(rows)


def extract_seismic_features(ds_nodash: str, **_) -> int:
    """Extract seismic hazard parameters for seismic model."""
    import pandas as pd
    import hashlib

    pg   = _get_pg_conn()
    ch   = _get_ch_client()
    snap = datetime.now(tz=timezone.utc).replace(second=0, microsecond=0)

    query = """
        SELECT
            ab.administrative_code   AS admin_code,
            ab.level                 AS admin_level,
            COALESCE((ab.attributes->>'pga_g')::FLOAT,           0.15) AS pga_g,
            COALESCE((ab.attributes->>'fault_distance_km')::FLOAT, 20) AS fault_dist_km,
            COALESCE((ab.attributes->>'seismic_zone')::INT,        2)  AS seismic_zone,
            COALESCE((ab.attributes->>'population_density')::FLOAT, 0) AS population_density,
            COALESCE(SUM(CASE WHEN il.reported_at >= NOW() - INTERVAL '30 days'
                              AND (il.attributes->>'magnitude')::FLOAT >= 3.0
                              THEN (il.attributes->>'magnitude')::FLOAT END), 0) AS mag_max_30d,
            COALESCE(SUM(CASE WHEN il.reported_at >= NOW() - INTERVAL '90 days'
                              THEN 1 END), 0) AS incident_count_90d,
            COALESCE(SUM(CASE WHEN il.reported_at >= NOW() - INTERVAL '365 days'
                              THEN 1 END), 0) AS incident_count_365d
        FROM gis.administrative_boundaries ab
        LEFT JOIN gis.incident_locations il
            ON ST_Within(il.location::geometry, ab.boundary::geometry)
           AND il.hazard_type = 'SEISMIC'
        WHERE ab.level = ANY(ARRAY[1,2,3])
        GROUP BY ab.administrative_code, ab.level, ab.attributes
        ORDER BY ab.administrative_code
    """

    df = pd.read_sql(query, pg)
    if df.empty:
        return 0

    rows = []
    for _, row in df.iterrows():
        rows.append({
            'snapshot_ts':         snap,
            'hazard_type':         'seismic',
            'admin_code':          row.admin_code,
            'admin_level':         int(row.admin_level),
            'peak_ground_acc_g':   float(row.pga_g),
            'fault_distance_km':   float(row.fault_dist_km),
            'magnitude_max_30d':   float(row.mag_max_30d),
            'seismic_zone_code':   int(row.seismic_zone),
            'incident_count_90d':  int(row.incident_count_90d),
            'incident_count_365d': int(row.incident_count_365d),
            'population_density':  float(row.population_density or 0),
            'data_quality_score':  0.9,
            'feature_hash':        hashlib.md5(
                f"seismic|{row.admin_code}|{snap.isoformat()}".encode()
            ).hexdigest()[:16],
        })

    if rows:
        ch.execute(f"INSERT INTO {CLICKHOUSE_DB}.{FEATURES_TABLE} VALUES", rows)
        log.info(f"Inserted {len(rows)} seismic feature rows")

    return len(rows)


def extract_wildfire_features(ds_nodash: str, **_) -> int:
    """Extract vegetation and weather features for wildfire model."""
    import pandas as pd
    import hashlib

    pg   = _get_pg_conn()
    ch   = _get_ch_client()
    snap = datetime.now(tz=timezone.utc).replace(second=0, microsecond=0)

    query = """
        SELECT
            ab.administrative_code   AS admin_code,
            ab.level                 AS admin_level,
            COALESCE((ab.attributes->>'ndvi_mean')::FLOAT,        0.4)  AS ndvi,
            COALESCE((ab.attributes->>'population_density')::FLOAT, 0)  AS population_density,
            COALESCE(SUM(CASE WHEN il.reported_at >= NOW() - INTERVAL '90 days'
                              THEN 1 END), 0) AS incident_count_90d,
            COALESCE(SUM(CASE WHEN il.reported_at >= NOW() - INTERVAL '365 days'
                              THEN 1 END), 0) AS incident_count_365d
        FROM gis.administrative_boundaries ab
        LEFT JOIN gis.incident_locations il
            ON ST_Within(il.location::geometry, ab.boundary::geometry)
           AND il.hazard_type = 'WILDFIRE'
        WHERE ab.level = ANY(ARRAY[1,2,3])
        GROUP BY ab.administrative_code, ab.level, ab.attributes
        ORDER BY ab.administrative_code
    """

    df = pd.read_sql(query, pg)
    if df.empty:
        return 0

    rows = []
    for _, row in df.iterrows():
        rows.append({
            'snapshot_ts':         snap,
            'hazard_type':         'wildfire',
            'admin_code':          row.admin_code,
            'admin_level':         int(row.admin_level),
            'ndvi_mean':           float(row.ndvi),
            'temp_max_7d_c':       35.0,  # from weather feed — TODO
            'wind_speed_ms':       5.0,
            'fire_weather_index':  15.0,
            'incident_count_90d':  int(row.incident_count_90d),
            'incident_count_365d': int(row.incident_count_365d),
            'population_density':  float(row.population_density or 0),
            'data_quality_score':  0.8,
            'feature_hash':        hashlib.md5(
                f"wildfire|{row.admin_code}|{snap.isoformat()}".encode()
            ).hexdigest()[:16],
        })

    if rows:
        ch.execute(f"INSERT INTO {CLICKHOUSE_DB}.{FEATURES_TABLE} VALUES", rows)
        log.info(f"Inserted {len(rows)} wildfire feature rows")

    return len(rows)


def notify_backend_features_ready(**_):
    """POST /api/v1/ml/features/notify to trigger on-demand inference if configured."""
    import requests
    backend_url = Variable.get('COESCD_BACKEND_URL', default_var='http://backend:4000')
    try:
        resp = requests.post(
            f"{backend_url}/api/v1/ml/features/ready",
            json={'timestamp': datetime.utcnow().isoformat()},
            timeout=10,
        )
        resp.raise_for_status()
        log.info("Backend feature-ready notification sent")
    except Exception as exc:
        log.warning(f"Failed to notify backend of feature extraction: {exc}")


# ── DAG ────────────────────────────────────────────────────────────────────────

with DAG(
    dag_id='coescd_ml_feature_extraction',
    description='Extract and materialise ML features into ClickHouse for all hazard models',
    schedule='*/30 * * * *',
    start_date=datetime(2026, 1, 1, tzinfo=timezone.utc),
    catchup=False,
    default_args=DEFAULT_ARGS,
    tags=['coescd', 'ml', 'features'],
    max_active_runs=1,
) as dag:

    t_schema = PythonOperator(
        task_id='ensure_clickhouse_schema',
        python_callable=ensure_clickhouse_schema,
    )

    t_hydro = PythonOperator(
        task_id='extract_hydro_features',
        python_callable=extract_hydro_features,
    )

    t_terrain = PythonOperator(
        task_id='extract_terrain_features',
        python_callable=extract_terrain_features,
    )

    t_seismic = PythonOperator(
        task_id='extract_seismic_features',
        python_callable=extract_seismic_features,
    )

    t_wildfire = PythonOperator(
        task_id='extract_wildfire_features',
        python_callable=extract_wildfire_features,
    )

    t_notify = PythonOperator(
        task_id='notify_backend_features_ready',
        python_callable=notify_backend_features_ready,
        trigger_rule='all_done',
    )

    t_schema >> [t_hydro, t_terrain, t_seismic, t_wildfire] >> t_notify
