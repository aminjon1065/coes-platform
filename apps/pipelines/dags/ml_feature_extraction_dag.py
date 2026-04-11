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


def _seasonal_hydro(month: int, elevation_m: float) -> dict:
    """
    Seasonal approximation of hydro-meteorological variables for Tajikistan.

    River stage peaks in May–June (snowmelt), is lowest in Jan–Feb.
    Precipitation peaks in Mar–May (western disturbances), dips in Jul–Sep.
    Drainage density increases with elevation up to ~3000 m.

    All values are best-estimate means in the absence of a live weather feed.
    When the administrative_boundary.attributes JSONB contains measured values
    they always take priority (see attribute-first logic in the caller).
    """
    import math
    # River stage: sinusoidal peak at month=5 (May), range [0.2, 2.5] m
    river_stage = 0.2 + 2.3 * max(0.0, math.sin((month - 1) * math.pi / 6))
    # Precipitation: peak Mar–May, trough Jul–Sep
    precip_monthly = 20 + 35 * max(0.0, math.cos((month - 4) * math.pi / 4))
    precip_7d  = round(precip_monthly * 7 / 30, 1)
    precip_30d = round(precip_monthly, 1)
    # Drainage density: higher at mid-elevation (1000–3000 m)
    drainage = min(2.5, max(0.1, elevation_m / 2000))
    return {
        'river_stage_m':    round(river_stage, 2),
        'precip_7d_mm':     precip_7d,
        'precip_30d_mm':    precip_30d,
        'drainage_density': round(drainage, 2),
    }


def _seasonal_soil(month: int, elevation_m: float) -> float:
    """
    Soil saturation % for Tajikistan.
    Peak in April–May (snowmelt + spring rain), minimum in August.
    Higher elevation = longer snowpack → delayed peak, higher saturation.
    """
    import math
    base_peak = 4 + max(0, (elevation_m - 1000) / 1000)   # peak month shifts later at altitude
    saturation = 25 + 55 * max(0.0, math.cos((month - base_peak) * math.pi / 5))
    return round(min(95.0, max(5.0, saturation)), 1)


def _seasonal_wildfire(month: int, elevation_m: float) -> dict:
    """
    Wildfire weather parameters for Tajikistan.
    Temperature: peaks in July (lower elevations), August (higher).
    Wind speed: somewhat higher in spring transition (March–April).
    Fire Weather Index: composite; high Jul–Aug in lowlands.
    """
    import math
    # Max 7-day temperature: ~35°C lowland summer, ~20°C at 3000 m
    elev_factor = max(0.0, 1.0 - elevation_m / 5000)
    temp_peak_month = 7 + max(0, int(elevation_m / 2000))
    temp = (10 + 25 * elev_factor) * max(0.0, math.sin((month - 2) * math.pi / 8))
    temp = round(max(5.0, temp), 1)
    # Wind speed: 3–8 m/s; slightly higher spring/summer
    wind = 3.5 + 4.5 * max(0.0, math.sin((month - 3) * math.pi / 6))
    wind = round(max(2.0, wind), 1)
    # FWI approximation: driven by temp, low humidity, wind
    fwi = round(temp * 0.6 + wind * 1.2, 1)
    return {
        'temp_max_7d_c':     temp,
        'wind_speed_ms':     wind,
        'fire_weather_index': fwi,
    }


def extract_hydro_features(ds_nodash: str, **_) -> int:
    """Extract precipitation, river stage, and flood history for flood model.

    Attribute-first strategy: values stored in gis.administrative_boundaries.attributes
    (populated by the boundary_refresh DAG or manual data entry) always take priority.
    When absent, a seasonal climatological estimate for Tajikistan is used as fallback.
    """
    import pandas as pd
    import hashlib

    pg    = _get_pg_conn()
    ch    = _get_ch_client()
    snap  = datetime.now(tz=timezone.utc).replace(second=0, microsecond=0)
    month = snap.month
    count = 0

    query = """
        SELECT
            ab.administrative_code                                           AS admin_code,
            ab.level                                                         AS admin_level,
            COALESCE((ab.attributes->>'elevation_mean_m')::FLOAT,  1200)    AS elevation_m,
            COALESCE((ab.attributes->>'precip_7d_mm')::FLOAT,      NULL)    AS precip_7d_mm,
            COALESCE((ab.attributes->>'precip_30d_mm')::FLOAT,     NULL)    AS precip_30d_mm,
            COALESCE((ab.attributes->>'river_stage_m')::FLOAT,     NULL)    AS river_stage_m,
            COALESCE((ab.attributes->>'drainage_density')::FLOAT,  NULL)    AS drainage_density,
            COALESCE(AVG(ab.attributes->>'population_density')::FLOAT, 0)   AS population_density,
            COALESCE(SUM(CASE WHEN il.reported_at >= NOW() - INTERVAL '90 days'
                              THEN 1 END), 0)                                AS incident_count_90d,
            COALESCE(SUM(CASE WHEN il.reported_at >= NOW() - INTERVAL '365 days'
                              THEN 1 END), 0)                                AS incident_count_365d
        FROM gis.administrative_boundaries ab
        LEFT JOIN gis.incident_locations il
            ON ST_Within(il.location::geometry, ab.boundary::geometry)
           AND il.hazard_type = 'FLOOD'
        WHERE ab.level = ANY(ARRAY[1,2,3])
        GROUP BY ab.administrative_code, ab.level, ab.attributes
        ORDER BY ab.administrative_code
    """

    df = pd.read_sql(query, pg)
    if df.empty:
        log.warning("No hydro feature rows returned — skipping")
        return 0

    rows = []
    for _, row in df.iterrows():
        elevation   = float(row.get('elevation_m') or 1200)
        seasonal    = _seasonal_hydro(month, elevation)

        # Attribute-first: use measured value when available, fall back to seasonal estimate
        precip_7d    = float(row.precip_7d_mm)    if row.precip_7d_mm    is not None else seasonal['precip_7d_mm']
        precip_30d   = float(row.precip_30d_mm)   if row.precip_30d_mm   is not None else seasonal['precip_30d_mm']
        river_stage  = float(row.river_stage_m)   if row.river_stage_m   is not None else seasonal['river_stage_m']
        drainage     = float(row.drainage_density) if row.drainage_density is not None else seasonal['drainage_density']

        rows.append({
            'snapshot_ts':         snap,
            'hazard_type':         'flood',
            'admin_code':          row.admin_code,
            'admin_level':         int(row.admin_level),
            'precip_7d_mm':        precip_7d,
            'precip_30d_mm':       precip_30d,
            'river_stage_m':       river_stage,
            'flood_freq_5yr':      int(row.incident_count_90d),
            'drainage_density':    drainage,
            'incident_count_90d':  int(row.incident_count_90d),
            'incident_count_365d': int(row.incident_count_365d),
            'population_density':  float(row.population_density or 0),
            'data_quality_score':  0.9 if row.river_stage_m is not None else 0.75,
            'feature_hash':        hashlib.md5(
                f"flood|{row.admin_code}|{snap.isoformat()}".encode()
            ).hexdigest()[:16],
        })

    if rows:
        ch.execute(f"INSERT INTO {CLICKHOUSE_DB}.{FEATURES_TABLE} VALUES", rows)
        count = len(rows)
        log.info(f"Inserted {count} hydro feature rows (month={month})")

    return count


def extract_terrain_features(ds_nodash: str, **_) -> int:
    """Extract slope, elevation, soil data for landslide model.

    Attribute-first strategy: soil_saturation_pct from boundary attributes takes
    priority over the seasonal climatological estimate.
    """
    import pandas as pd
    import hashlib

    pg    = _get_pg_conn()
    ch    = _get_ch_client()
    snap  = datetime.now(tz=timezone.utc).replace(second=0, microsecond=0)
    month = snap.month

    query = """
        SELECT
            ab.administrative_code                                            AS admin_code,
            ab.level                                                          AS admin_level,
            COALESCE((ab.attributes->>'slope_mean_deg')::FLOAT,       12.0)  AS slope_mean_deg,
            COALESCE((ab.attributes->>'slope_max_deg')::FLOAT,        35.0)  AS slope_max_deg,
            COALESCE((ab.attributes->>'elevation_mean_m')::FLOAT,     1500)  AS elevation_mean_m,
            COALESCE((ab.attributes->>'curvature_mean')::FLOAT,        0.0)  AS curvature_mean,
            COALESCE((ab.attributes->>'lithology_code')::INT,            1)  AS lithology_code,
            COALESCE((ab.attributes->>'population_density')::FLOAT,    0)    AS population_density,
            (ab.attributes->>'soil_saturation_pct')::FLOAT                   AS soil_saturation_pct,
            COALESCE(SUM(CASE WHEN il.reported_at >= NOW() - INTERVAL '90 days'
                              THEN 1 END), 0)                                 AS incident_count_90d,
            COALESCE(SUM(CASE WHEN il.reported_at >= NOW() - INTERVAL '365 days'
                              THEN 1 END), 0)                                 AS incident_count_365d
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
        elevation = float(row.elevation_mean_m or 1500)
        # Attribute-first: use measured soil saturation when available
        soil_sat = (
            float(row.soil_saturation_pct)
            if row.soil_saturation_pct is not None
            else _seasonal_soil(month, elevation)
        )
        has_measured = row.soil_saturation_pct is not None

        rows.append({
            'snapshot_ts':         snap,
            'hazard_type':         'landslide',
            'admin_code':          row.admin_code,
            'admin_level':         int(row.admin_level),
            'slope_mean_deg':      float(row.slope_mean_deg),
            'slope_max_deg':       float(row.slope_max_deg),
            'elevation_mean_m':    elevation,
            'curvature_mean':      float(row.curvature_mean),
            'lithology_code':      int(row.lithology_code),
            'soil_saturation_pct': soil_sat,
            'incident_count_90d':  int(row.incident_count_90d),
            'incident_count_365d': int(row.incident_count_365d),
            'population_density':  float(row.population_density or 0),
            'data_quality_score':  0.9 if has_measured else 0.75,
            'feature_hash':        hashlib.md5(
                f"landslide|{row.admin_code}|{snap.isoformat()}".encode()
            ).hexdigest()[:16],
        })

    if rows:
        ch.execute(f"INSERT INTO {CLICKHOUSE_DB}.{FEATURES_TABLE} VALUES", rows)
        log.info(f"Inserted {len(rows)} terrain feature rows (month={month})")

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
    """Extract vegetation and weather features for wildfire model.

    Attribute-first strategy: temp_max_7d_c, wind_speed_ms, fire_weather_index from
    boundary attributes take priority. Seasonal climatological estimates are used
    when measured values are absent.
    """
    import pandas as pd
    import hashlib

    pg   = _get_pg_conn()
    ch   = _get_ch_client()
    snap = datetime.now(tz=timezone.utc).replace(second=0, microsecond=0)
    month = snap.month

    query = """
        SELECT
            ab.administrative_code                                            AS admin_code,
            ab.level                                                          AS admin_level,
            COALESCE((ab.attributes->>'elevation_mean_m')::FLOAT,    800)    AS elevation_m,
            COALESCE((ab.attributes->>'ndvi_mean')::FLOAT,           0.4)    AS ndvi,
            COALESCE((ab.attributes->>'population_density')::FLOAT,    0)    AS population_density,
            (ab.attributes->>'temp_max_7d_c')::FLOAT                         AS temp_max_7d_c,
            (ab.attributes->>'wind_speed_ms')::FLOAT                          AS wind_speed_ms,
            (ab.attributes->>'fire_weather_index')::FLOAT                     AS fire_weather_index,
            COALESCE(SUM(CASE WHEN il.reported_at >= NOW() - INTERVAL '90 days'
                              THEN 1 END), 0)                                 AS incident_count_90d,
            COALESCE(SUM(CASE WHEN il.reported_at >= NOW() - INTERVAL '365 days'
                              THEN 1 END), 0)                                 AS incident_count_365d
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
        elevation = float(row.get('elevation_m') or 800)
        seasonal  = _seasonal_wildfire(month, elevation)

        # Attribute-first: use measured values when present
        temp  = float(row.temp_max_7d_c)      if row.temp_max_7d_c      is not None else seasonal['temp_max_7d_c']
        wind  = float(row.wind_speed_ms)       if row.wind_speed_ms       is not None else seasonal['wind_speed_ms']
        fwi   = float(row.fire_weather_index)  if row.fire_weather_index  is not None else seasonal['fire_weather_index']
        has_measured = (
            row.temp_max_7d_c is not None
            and row.wind_speed_ms is not None
        )

        rows.append({
            'snapshot_ts':         snap,
            'hazard_type':         'wildfire',
            'admin_code':          row.admin_code,
            'admin_level':         int(row.admin_level),
            'ndvi_mean':           float(row.ndvi),
            'temp_max_7d_c':       temp,
            'wind_speed_ms':       wind,
            'fire_weather_index':  fwi,
            'incident_count_90d':  int(row.incident_count_90d),
            'incident_count_365d': int(row.incident_count_365d),
            'population_density':  float(row.population_density or 0),
            'data_quality_score':  0.9 if has_measured else 0.75,
            'feature_hash':        hashlib.md5(
                f"wildfire|{row.admin_code}|{snap.isoformat()}".encode()
            ).hexdigest()[:16],
        })

    if rows:
        ch.execute(f"INSERT INTO {CLICKHOUSE_DB}.{FEATURES_TABLE} VALUES", rows)
        log.info(f"Inserted {len(rows)} wildfire feature rows (month={month})")

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
