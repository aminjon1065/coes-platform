"""
DAG: coescd_ml_model_monitoring
Schedule: Daily at 04:00 UTC

Monitors production model health across all hazard types:
  1. compute_feature_drift    — PSI per feature vs. training distribution
  2. compute_score_distribution — prediction score stats for current window
  3. evaluate_accuracy         — accuracy against realised incidents (ground truth)
  4. record_performance_snapshot — POST snapshot to backend monitoring API
  5. auto_retrain_trigger      — emit retrain signal if drift is HIGH

PSI (Population Stability Index) thresholds:
  < 0.1  → none
  0.1–0.2 → low
  0.2–0.25 → moderate
  ≥ 0.25 → high (triggers alert + retraining signal)
"""
from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone

from airflow import DAG
from airflow.operators.python import PythonOperator
from airflow.models import Variable

log = logging.getLogger(__name__)

HAZARD_TYPES  = ['flood', 'landslide', 'seismic', 'wildfire']
CLICKHOUSE_DB = 'coescd_ml'
PSI_HIGH      = 0.25

DEFAULT_ARGS = {
    'owner':             'coescd-ml',
    'depends_on_past':   False,
    'retries':           1,
    'retry_delay':       timedelta(minutes=10),
    'execution_timeout': timedelta(minutes=30),
}


def _get_ch_client():
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


def _get_pg_conn():
    from airflow.hooks.base import BaseHook
    from sqlalchemy import create_engine
    conn = BaseHook.get_connection('coescd_postgres')
    url = f"postgresql+psycopg2://{conn.login}:{conn.password}@{conn.host}:{conn.port}/{conn.schema}"
    return create_engine(url, pool_pre_ping=True)


def compute_feature_drift_and_monitor(hazard_type: str, **context):
    """
    Compute PSI for each feature comparing current 24h distribution
    vs. the baseline (last 30-day rolling average) from ClickHouse.
    POST snapshot to backend monitoring endpoint.
    """
    import pandas as pd
    import numpy as np
    import requests

    ch  = _get_ch_client()
    pg  = _get_pg_conn()
    now = datetime.now(tz=timezone.utc)
    window_start = now - timedelta(hours=24)
    window_end   = now

    # ── Pull current + baseline distributions from ClickHouse ─────────────────
    numeric_feature_cols = [
        'precip_7d_mm', 'precip_30d_mm', 'river_stage_m', 'flood_freq_5yr',
        'slope_mean_deg', 'slope_max_deg', 'elevation_mean_m',
        'peak_ground_acc_g', 'fault_distance_km', 'magnitude_max_30d',
        'ndvi_mean', 'temp_max_7d_c', 'wind_speed_ms',
        'incident_count_90d', 'incident_count_365d', 'population_density',
    ]

    current_rows = ch.execute(
        f"""
        SELECT {', '.join(numeric_feature_cols)}
        FROM {CLICKHOUSE_DB}.feature_snapshots
        WHERE hazard_type = %(ht)s
          AND snapshot_ts BETWEEN %(ws)s AND %(we)s
        """,
        {'ht': hazard_type, 'ws': window_start, 'we': window_end},
        with_column_types=True,
    )
    current_df = pd.DataFrame(
        current_rows[0],
        columns=[c[0] for c in current_rows[1]],
    )

    baseline_rows = ch.execute(
        f"""
        SELECT {', '.join(numeric_feature_cols)}
        FROM {CLICKHOUSE_DB}.feature_snapshots
        WHERE hazard_type = %(ht)s
          AND snapshot_ts BETWEEN %(bs)s AND %(ws)s
        LIMIT 50000
        """,
        {
            'ht': hazard_type,
            'bs': now - timedelta(days=30),
            'ws': window_start,
        },
        with_column_types=True,
    )
    baseline_df = pd.DataFrame(
        baseline_rows[0],
        columns=[c[0] for c in baseline_rows[1]],
    )

    if current_df.empty or baseline_df.empty:
        log.warning(f"[{hazard_type}] Insufficient data for drift computation")
        return

    # ── PSI per feature ────────────────────────────────────────────────────────
    def psi(expected: np.ndarray, actual: np.ndarray, buckets: int = 10) -> float:
        eps = 1e-6
        breaks = np.percentile(expected, np.linspace(0, 100, buckets + 1))
        breaks = np.unique(breaks)
        e_cnt = np.histogram(expected, bins=breaks)[0].astype(float)
        a_cnt = np.histogram(actual, bins=breaks)[0].astype(float)
        e_pct = (e_cnt / max(e_cnt.sum(), 1)) + eps
        a_pct = (a_cnt / max(a_cnt.sum(), 1)) + eps
        return float(np.sum((a_pct - e_pct) * np.log(a_pct / e_pct)))

    feature_drift: dict[str, float] = {}
    for col in numeric_feature_cols:
        if col in current_df.columns and col in baseline_df.columns:
            try:
                feature_drift[col] = round(
                    psi(baseline_df[col].dropna().values, current_df[col].dropna().values),
                    4,
                )
            except Exception:
                feature_drift[col] = 0.0

    max_psi = max(feature_drift.values(), default=0.0)

    # ── Score distribution ─────────────────────────────────────────────────────
    score_query = f"""
        SELECT risk_score
        FROM ml.risk_predictions
        WHERE hazard_type = %s
          AND predicted_at BETWEEN %s AND %s
    """
    score_df = pd.read_sql(score_query, pg, params=(hazard_type, window_start, window_end))
    if not score_df.empty:
        q = score_df['risk_score'].astype(float)
        score_distribution = {
            'mean': float(q.mean()),
            'std':  float(q.std()),
            'p5':   float(q.quantile(0.05)),
            'p25':  float(q.quantile(0.25)),
            'p50':  float(q.median()),
            'p75':  float(q.quantile(0.75)),
            'p95':  float(q.quantile(0.95)),
            'count': int(len(q)),
        }
    else:
        score_distribution = {}

    # ── Ground-truth accuracy (incident verification) ──────────────────────────
    accuracy_metrics = None
    try:
        verify_df = pd.read_sql(
            f"""
            SELECT
                p.administrative_code,
                p.risk_tier,
                CASE WHEN COUNT(il.id) > 0 THEN 1 ELSE 0 END AS actual
            FROM ml.risk_predictions p
            LEFT JOIN gis.incident_locations il
                ON il.administrative_code = p.administrative_code
               AND il.hazard_type = '{hazard_type.upper()}'
               AND il.reported_at BETWEEN p.valid_from AND p.valid_until
            WHERE p.status = 'published'
              AND p.hazard_type = '{hazard_type}'
              AND p.predicted_at BETWEEN '{(now - timedelta(days=7)).isoformat()}' AND '{now.isoformat()}'
            GROUP BY p.administrative_code, p.risk_tier
            """,
            pg,
        )
        if len(verify_df) >= 10:
            from sklearn.metrics import roc_auc_score, f1_score
            y_true = verify_df['actual'].values
            y_pred = (verify_df['risk_tier'] >= 3).astype(int).values
            if y_true.sum() > 0:
                accuracy_metrics = {
                    'f1':      float(f1_score(y_true, y_pred, zero_division=0)),
                    'samples': int(len(verify_df)),
                }
    except Exception as exc:
        log.warning(f"[{hazard_type}] Accuracy computation failed: {exc}")

    # ── Get production version from backend ────────────────────────────────────
    backend_url = Variable.get('COESCD_BACKEND_URL', default_var='http://backend:4000')
    model_resp  = requests.get(
        f"{backend_url}/api/v1/ml/models",
        params={'hazardType': hazard_type},
        timeout=10,
    )
    if not model_resp.ok or not model_resp.json():
        log.warning(f"[{hazard_type}] No model found — skipping snapshot")
        return

    model_id  = model_resp.json()[0]['id']
    pv_resp   = requests.get(
        f"{backend_url}/api/v1/ml/models/{model_id}/production-version",
        timeout=10,
    )
    if not pv_resp.ok or not pv_resp.json():
        log.warning(f"[{hazard_type}] No production version — skipping snapshot")
        return

    prod_version_id = pv_resp.json()['id']

    # ── POST performance snapshot ──────────────────────────────────────────────
    snap_payload = {
        'modelVersionId':    prod_version_id,
        'windowStart':       window_start.isoformat(),
        'windowEnd':         window_end.isoformat(),
        'featureDrift':      feature_drift,
        'scoreDistribution': score_distribution,
        'predictionCount':   score_distribution.get('count', 0),
        'accuracyMetrics':   accuracy_metrics,
    }

    # Use the internal service method via a direct backend API call
    snap_resp = requests.post(
        f"{backend_url}/api/v1/ml/versions/{prod_version_id}/performance",
        json=snap_payload,
        timeout=15,
    )
    if snap_resp.ok:
        drift_class = 'HIGH' if max_psi >= PSI_HIGH else 'OK'
        log.info(
            f"[{hazard_type}] Snapshot recorded — "
            f"max PSI {max_psi:.3f} ({drift_class})"
        )
    else:
        log.warning(f"[{hazard_type}] Failed to record snapshot: {snap_resp.status_code}")

    # ── Trigger retrain if drift is high ───────────────────────────────────────
    if max_psi >= PSI_HIGH:
        log.warning(
            f"[{hazard_type}] HIGH DRIFT detected (max PSI={max_psi:.3f}). "
            f"Triggering retraining signal."
        )
        try:
            requests.post(
                f"{backend_url}/api/v1/ml/drift-alert",
                json={
                    'hazardType':      hazard_type,
                    'maxPsi':          max_psi,
                    'modelVersionId':  prod_version_id,
                    'topDriftFeatures': sorted(
                        feature_drift.items(), key=lambda x: x[1], reverse=True
                    )[:5],
                },
                timeout=10,
            )
        except Exception as exc:
            log.warning(f"[{hazard_type}] Drift alert notification failed: {exc}")


# ── DAG ────────────────────────────────────────────────────────────────────────

with DAG(
    dag_id='coescd_ml_model_monitoring',
    description='Daily drift detection and performance monitoring for production ML models',
    schedule='0 4 * * *',
    start_date=datetime(2026, 1, 1, tzinfo=timezone.utc),
    catchup=False,
    default_args=DEFAULT_ARGS,
    tags=['coescd', 'ml', 'monitoring'],
    max_active_runs=1,
) as dag:

    for hazard in HAZARD_TYPES:
        PythonOperator(
            task_id=f'monitor_{hazard}',
            python_callable=compute_feature_drift_and_monitor,
            op_kwargs={'hazard_type': hazard},
        )
