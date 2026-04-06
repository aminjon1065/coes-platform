"""
DAG: coescd_ml_training
Schedule: Daily at 01:00 UTC (off-peak)

Trains / re-trains risk scoring models for all four hazard types using
features from ClickHouse and ground-truth labels from the Analytics domain.

Pipeline stages per hazard type:
  1. check_training_data   — verify feature freshness + label coverage
  2. build_training_matrix — join features + labels, split train/val/test
  3. train_model           — XGBoost training with MLflow experiment tracking
  4. evaluate_model        — compute AUC-ROC, F1, SHAP values on held-out test set
  5. register_with_mlflow  — log artefact + metrics to MLflow model registry
  6. notify_backend        — POST new version to backend for HITL review queue
"""
from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone

from airflow import DAG
from airflow.operators.python import PythonOperator, ShortCircuitOperator
from airflow.models import Variable

log = logging.getLogger(__name__)

HAZARD_TYPES  = ['flood', 'landslide', 'seismic', 'wildfire']
CLICKHOUSE_DB = 'coescd_ml'
MIN_LABEL_ROWS = 50   # abort training if fewer labelled examples exist

DEFAULT_ARGS = {
    'owner':             'coescd-ml',
    'depends_on_past':   False,
    'retries':           1,
    'retry_delay':       timedelta(minutes=10),
    'execution_timeout': timedelta(hours=2),
}

# ── Shared helpers ─────────────────────────────────────────────────────────────

def _get_pg_conn():
    from airflow.hooks.base import BaseHook
    from sqlalchemy import create_engine
    conn = BaseHook.get_connection('coescd_postgres')
    url = f"postgresql+psycopg2://{conn.login}:{conn.password}@{conn.host}:{conn.port}/{conn.schema}"
    return create_engine(url, pool_pre_ping=True)


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


def _mlflow_client():
    import mlflow
    tracking_uri = Variable.get('MLFLOW_TRACKING_URI', default_var='http://mlflow:5000')
    mlflow.set_tracking_uri(tracking_uri)
    return mlflow.tracking.MlflowClient()


# ── Per-hazard task callables ──────────────────────────────────────────────────

def check_training_data(hazard_type: str, **_) -> bool:
    """Return False (short-circuit) if insufficient labelled data exists."""
    pg = _get_pg_conn()
    import pandas as pd

    label_query = f"""
        SELECT COUNT(*) AS cnt
        FROM analytics.incidents
        WHERE incident_type ILIKE '%{hazard_type}%'
          AND status IN ('resolved', 'closed')
          AND reported_at >= NOW() - INTERVAL '2 years'
    """
    df = pd.read_sql(label_query, pg)
    cnt = int(df['cnt'].iloc[0])
    if cnt < MIN_LABEL_ROWS:
        log.warning(
            f"[{hazard_type}] Only {cnt} labelled examples — skipping training "
            f"(minimum {MIN_LABEL_ROWS})"
        )
        return False
    log.info(f"[{hazard_type}] {cnt} labelled examples — proceeding")
    return True


def build_training_matrix(hazard_type: str, **context) -> dict:
    """Join ClickHouse features with Postgres labels, push to XCom."""
    import pandas as pd
    import numpy as np

    ch = _get_ch_client()
    pg = _get_pg_conn()

    # Pull latest features per admin unit from ClickHouse
    feature_rows = ch.execute(
        f"""
        SELECT * FROM {CLICKHOUSE_DB}.latest_features
        WHERE hazard_type = %(ht)s
          AND snapshot_ts >= now() - INTERVAL 7 DAY
        """,
        {'ht': hazard_type},
        with_column_types=True,
    )
    rows, col_types = feature_rows
    cols = [c[0] for c in col_types]
    features_df = pd.DataFrame(rows, columns=cols)

    if features_df.empty:
        raise ValueError(f"[{hazard_type}] No feature rows in ClickHouse — aborting")

    # Pull binary labels: 1 = incident occurred in this admin unit in next 30d
    labels_df = pd.read_sql(
        f"""
        SELECT
            ab.administrative_code                                AS admin_code,
            CASE WHEN COUNT(il.id) > 0 THEN 1 ELSE 0 END         AS label
        FROM gis.administrative_boundaries ab
        LEFT JOIN gis.incident_locations il
               ON ST_Within(il.location::geometry, ab.boundary::geometry)
              AND il.hazard_type = '{hazard_type.upper()}'
              AND il.reported_at BETWEEN NOW() - INTERVAL '30 days' AND NOW()
        WHERE ab.level = 3
        GROUP BY ab.administrative_code
        """,
        pg,
    )

    matrix = features_df.merge(labels_df, on='admin_code', how='inner')
    matrix.fillna(0, inplace=True)

    # Push small stats to XCom (not full DataFrame — use tmp path)
    import tempfile, os
    tmp = tempfile.mktemp(suffix='.parquet')
    matrix.to_parquet(tmp, index=False)
    log.info(f"[{hazard_type}] Training matrix: {len(matrix)} rows, saved to {tmp}")

    context['task_instance'].xcom_push(key=f'{hazard_type}_matrix_path', value=tmp)
    context['task_instance'].xcom_push(key=f'{hazard_type}_row_count', value=len(matrix))
    return {'rows': len(matrix), 'path': tmp}


def train_model(hazard_type: str, **context) -> dict:
    """XGBoost training with MLflow autolog."""
    import pandas as pd
    import numpy as np
    import mlflow
    import mlflow.xgboost
    import xgboost as xgb
    from sklearn.model_selection import train_test_split
    from sklearn.metrics import roc_auc_score, f1_score, precision_score, recall_score

    matrix_path = context['task_instance'].xcom_pull(
        key=f'{hazard_type}_matrix_path',
        task_ids=f'build_training_matrix_{hazard_type}',
    )
    df = pd.read_parquet(matrix_path)

    exclude_cols = {
        'snapshot_ts', 'hazard_type', 'admin_code', 'feature_hash',
        'data_quality_score', 'label',
    }
    feature_cols = [c for c in df.columns if c not in exclude_cols]
    X = df[feature_cols].astype(np.float32)
    y = df['label'].astype(np.int32)

    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, stratify=y, random_state=42
    )

    tracking_uri = Variable.get('MLFLOW_TRACKING_URI', default_var='http://mlflow:5000')
    mlflow.set_tracking_uri(tracking_uri)

    experiment_name = f"coescd-{hazard_type}-risk"
    mlflow.set_experiment(experiment_name)

    with mlflow.start_run() as run:
        mlflow.xgboost.autolog(log_models=True, log_input_examples=True)

        params = {
            'n_estimators':     400,
            'max_depth':        6,
            'learning_rate':    0.05,
            'subsample':        0.8,
            'colsample_bytree': 0.8,
            'min_child_weight': 5,
            'gamma':            0.1,
            'scale_pos_weight': max(1, (y_train == 0).sum() / max(1, (y_train == 1).sum())),
            'tree_method':      'hist',
            'random_state':     42,
            'use_label_encoder': False,
            'eval_metric':      'logloss',
        }
        model = xgb.XGBClassifier(**params)
        model.fit(X_train, y_train, eval_set=[(X_test, y_test)], verbose=False)

        y_prob = model.predict_proba(X_test)[:, 1]
        y_pred = (y_prob >= 0.5).astype(int)

        metrics = {
            'auc_roc':   float(roc_auc_score(y_test, y_prob)),
            'f1':        float(f1_score(y_test, y_pred, zero_division=0)),
            'precision': float(precision_score(y_test, y_pred, zero_division=0)),
            'recall':    float(recall_score(y_test, y_pred, zero_division=0)),
        }
        mlflow.log_metrics(metrics)
        mlflow.log_param('feature_count', len(feature_cols))
        mlflow.log_param('train_rows', len(X_train))
        mlflow.log_param('test_rows', len(X_test))

        fi = dict(zip(feature_cols, model.feature_importances_.tolist()))

        result = {
            'run_id':             run.info.run_id,
            'metrics':            metrics,
            'feature_importances': fi,
            'feature_cols':       feature_cols,
            'artifact_uri':       run.info.artifact_uri,
        }
        context['task_instance'].xcom_push(key=f'{hazard_type}_run_result', value=result)
        log.info(f"[{hazard_type}] Training complete — AUC {metrics['auc_roc']:.4f}")
        return result


def register_version_with_backend(hazard_type: str, **context):
    """POST new model version to CoESCD backend for HITL review queue."""
    import requests

    run_result = context['task_instance'].xcom_pull(
        key=f'{hazard_type}_run_result',
        task_ids=f'train_model_{hazard_type}',
    )
    if not run_result:
        log.warning(f"[{hazard_type}] No run result — skipping backend registration")
        return

    backend_url = Variable.get('COESCD_BACKEND_URL', default_var='http://backend:4000')

    # 1. Find or create the model record
    model_resp = requests.get(
        f"{backend_url}/api/v1/ml/models",
        params={'hazardType': hazard_type},
        timeout=15,
    )
    models = model_resp.json() if model_resp.ok else []
    model_id = models[0]['id'] if models else None

    if not model_id:
        create_resp = requests.post(
            f"{backend_url}/api/v1/ml/models",
            json={
                'name':         f'{hazard_type}-risk-xgb',
                'hazardType':   hazard_type,
                'framework':    'xgboost',
                'featureNames': run_result['feature_cols'],
            },
            timeout=15,
        )
        create_resp.raise_for_status()
        model_id = create_resp.json()['id']

    # 2. Register the new version (status = staging, pending HITL review)
    from datetime import datetime
    version_tag = datetime.utcnow().strftime('%Y%m%d-%H%M')
    reg_resp = requests.post(
        f"{backend_url}/api/v1/ml/versions",
        json={
            'modelId':            model_id,
            'version':            version_tag,
            'mlflowRunId':        run_result['run_id'],
            'artifactUri':        run_result['artifact_uri'],
            'evalMetrics':        run_result['metrics'],
            'featureImportances': run_result['feature_importances'],
            'trainingDatasetMeta': {
                'rows': context['task_instance'].xcom_pull(
                    key=f'{hazard_type}_row_count',
                    task_ids=f'build_training_matrix_{hazard_type}',
                ),
                'run_date': datetime.utcnow().isoformat(),
            },
        },
        timeout=15,
    )
    reg_resp.raise_for_status()
    log.info(f"[{hazard_type}] Version {version_tag} registered — "
             f"AUC {run_result['metrics']['auc_roc']:.4f}")


# ── DAG ────────────────────────────────────────────────────────────────────────

with DAG(
    dag_id='coescd_ml_training',
    description='Daily re-training of flood/landslide/seismic/wildfire risk models',
    schedule='0 1 * * *',
    start_date=datetime(2026, 1, 1, tzinfo=timezone.utc),
    catchup=False,
    default_args=DEFAULT_ARGS,
    tags=['coescd', 'ml', 'training'],
    max_active_runs=1,
) as dag:

    for hazard in HAZARD_TYPES:
        t_check = ShortCircuitOperator(
            task_id=f'check_training_data_{hazard}',
            python_callable=check_training_data,
            op_kwargs={'hazard_type': hazard},
        )

        t_matrix = PythonOperator(
            task_id=f'build_training_matrix_{hazard}',
            python_callable=build_training_matrix,
            op_kwargs={'hazard_type': hazard},
        )

        t_train = PythonOperator(
            task_id=f'train_model_{hazard}',
            python_callable=train_model,
            op_kwargs={'hazard_type': hazard},
        )

        t_register = PythonOperator(
            task_id=f'register_version_{hazard}',
            python_callable=register_version_with_backend,
            op_kwargs={'hazard_type': hazard},
        )

        t_check >> t_matrix >> t_train >> t_register
