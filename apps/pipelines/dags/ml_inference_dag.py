"""
DAG: coescd_ml_inference
Schedule: Every 6 hours

Runs batch inference using production model versions for all hazard types.
Predictions are written to the backend ML API as pending HITL review items.

Stages per hazard type:
  1. get_production_version  — fetch the active production model version id
  2. load_model_and_predict  — load XGBoost from MLflow artefact store, score all admin units
  3. compute_shap_values      — top-10 SHAP contributions per prediction
  4. push_predictions         — POST to backend /api/v1/ml/predictions
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
VALID_HOURS   = 6   # prediction validity window

DEFAULT_ARGS = {
    'owner':             'coescd-ml',
    'depends_on_past':   False,
    'retries':           2,
    'retry_delay':       timedelta(minutes=5),
    'execution_timeout': timedelta(minutes=45),
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


def get_production_version(hazard_type: str, **context) -> bool:
    """Fetch production model version from backend. Short-circuit if none exists."""
    import requests
    backend_url = Variable.get('COESCD_BACKEND_URL', default_var='http://backend:4000')

    resp = requests.get(
        f"{backend_url}/api/v1/ml/models",
        params={'hazardType': hazard_type},
        timeout=15,
    )
    if not resp.ok or not resp.json():
        log.warning(f"[{hazard_type}] No model registered — skipping inference")
        return False

    model_id = resp.json()[0]['id']
    pv_resp  = requests.get(
        f"{backend_url}/api/v1/ml/models/{model_id}/production-version",
        timeout=15,
    )
    if not pv_resp.ok or not pv_resp.json():
        log.warning(f"[{hazard_type}] No production version — skipping inference")
        return False

    prod_version = pv_resp.json()
    context['task_instance'].xcom_push(
        key=f'{hazard_type}_prod_version',
        value=prod_version,
    )
    log.info(
        f"[{hazard_type}] Production version: {prod_version['version']} "
        f"(MLflow run {prod_version.get('mlflowRunId')})"
    )
    return True


def load_and_predict(hazard_type: str, **context) -> list:
    """Load XGBoost model from MLflow and score all admin units."""
    import pandas as pd
    import numpy as np
    import mlflow.xgboost

    prod_version = context['task_instance'].xcom_pull(
        key=f'{hazard_type}_prod_version',
        task_ids=f'get_production_version_{hazard_type}',
    )
    artifact_uri = prod_version.get('artifactUri')
    if not artifact_uri:
        raise ValueError(f"[{hazard_type}] No artifact_uri on production version")

    tracking_uri = Variable.get('MLFLOW_TRACKING_URI', default_var='http://mlflow:5000')
    mlflow.set_tracking_uri(tracking_uri)

    model = mlflow.xgboost.load_model(artifact_uri)
    feature_names = prod_version.get('model', {}).get('featureNames', [])

    ch = _get_ch_client()
    rows, col_types = ch.execute(
        f"""
        SELECT * FROM {CLICKHOUSE_DB}.latest_features
        WHERE hazard_type = %(ht)s
          AND snapshot_ts >= now() - INTERVAL 2 HOUR
        """,
        {'ht': hazard_type},
        with_column_types=True,
    )
    cols = [c[0] for c in col_types]
    features_df = pd.DataFrame(rows, columns=cols)

    if features_df.empty:
        log.warning(f"[{hazard_type}] No feature rows — skipping predictions")
        context['task_instance'].xcom_push(key=f'{hazard_type}_predictions', value=[])
        return []

    exclude = {'snapshot_ts', 'hazard_type', 'admin_code', 'feature_hash', 'data_quality_score'}
    avail_features = [c for c in features_df.columns if c not in exclude]
    X = features_df[avail_features].fillna(0).astype(np.float32)

    scores = model.predict_proba(X)[:, 1]

    predictions = []
    now          = datetime.now(tz=timezone.utc)
    valid_until  = now + timedelta(hours=VALID_HOURS)

    for i, (_, row) in enumerate(features_df.iterrows()):
        score    = float(scores[i])
        tier     = 1 if score < 0.3 else (2 if score < 0.5 else (3 if score < 0.75 else 4))
        predictions.append({
            'modelVersionId':    prod_version['id'],
            'hazardType':        hazard_type,
            'administrativeCode': row['admin_code'],
            'riskScore':         round(score, 4),
            'riskTier':          tier,
            'inputFeatures':     {col: float(row.get(col, 0)) for col in avail_features[:20]},
            'validFrom':         now.isoformat(),
            'validUntil':        valid_until.isoformat(),
            'classification':    1,
        })

    context['task_instance'].xcom_push(key=f'{hazard_type}_predictions', value=predictions)
    log.info(f"[{hazard_type}] Generated {len(predictions)} predictions")
    return predictions


def compute_shap_values(hazard_type: str, **context):
    """Compute SHAP values for top-N critical predictions (tier >= 3)."""
    import numpy as np
    import shap
    import mlflow.xgboost

    predictions = context['task_instance'].xcom_pull(
        key=f'{hazard_type}_predictions',
        task_ids=f'load_and_predict_{hazard_type}',
    )
    if not predictions:
        return

    prod_version = context['task_instance'].xcom_pull(
        key=f'{hazard_type}_prod_version',
        task_ids=f'get_production_version_{hazard_type}',
    )

    # Only compute SHAP for high/critical predictions (cost control)
    critical = [p for p in predictions if p['riskTier'] >= 3]
    if not critical:
        log.info(f"[{hazard_type}] No critical predictions — skipping SHAP")
        return

    tracking_uri = Variable.get('MLFLOW_TRACKING_URI', default_var='http://mlflow:5000')
    mlflow.set_tracking_uri(tracking_uri)
    model = mlflow.xgboost.load_model(prod_version['artifactUri'])

    import pandas as pd
    input_df = pd.DataFrame([p['inputFeatures'] for p in critical]).fillna(0)
    explainer  = shap.TreeExplainer(model)
    shap_vals  = explainer.shap_values(input_df)

    for i, pred in enumerate(critical):
        top_shap = {}
        if i < len(shap_vals):
            abs_shap = np.abs(shap_vals[i])
            top_idx  = np.argsort(abs_shap)[::-1][:10]
            for idx in top_idx:
                col = input_df.columns[idx]
                top_shap[col] = float(shap_vals[i][idx])
        pred['shapValues'] = top_shap

    # Write updated predictions back to XCom
    all_preds = [p for p in predictions if p['riskTier'] < 3]
    all_preds.extend(critical)
    context['task_instance'].xcom_push(key=f'{hazard_type}_predictions', value=all_preds)
    log.info(f"[{hazard_type}] SHAP values computed for {len(critical)} critical predictions")


def push_predictions_to_backend(hazard_type: str, **context):
    """POST predictions to backend ML API in batches of 50."""
    import requests

    predictions = context['task_instance'].xcom_pull(
        key=f'{hazard_type}_predictions',
        task_ids=f'compute_shap_{hazard_type}',
    ) or context['task_instance'].xcom_pull(
        key=f'{hazard_type}_predictions',
        task_ids=f'load_and_predict_{hazard_type}',
    )

    if not predictions:
        log.info(f"[{hazard_type}] No predictions to push")
        return

    backend_url = Variable.get('COESCD_BACKEND_URL', default_var='http://backend:4000')
    batch_size  = 50
    pushed = 0

    for i in range(0, len(predictions), batch_size):
        batch = predictions[i:i + batch_size]
        for pred in batch:
            resp = requests.post(
                f"{backend_url}/api/v1/ml/predictions",
                json=pred,
                timeout=10,
            )
            if resp.ok:
                pushed += 1
            else:
                log.warning(f"[{hazard_type}] Failed to push prediction: {resp.status_code}")

    log.info(f"[{hazard_type}] Pushed {pushed}/{len(predictions)} predictions to backend")


# ── DAG ────────────────────────────────────────────────────────────────────────

with DAG(
    dag_id='coescd_ml_inference',
    description='Batch risk scoring for all hazard types every 6 hours',
    schedule='0 */6 * * *',
    start_date=datetime(2026, 1, 1, tzinfo=timezone.utc),
    catchup=False,
    default_args=DEFAULT_ARGS,
    tags=['coescd', 'ml', 'inference'],
    max_active_runs=1,
) as dag:

    for hazard in HAZARD_TYPES:
        t_get_prod = ShortCircuitOperator(
            task_id=f'get_production_version_{hazard}',
            python_callable=get_production_version,
            op_kwargs={'hazard_type': hazard},
        )

        t_predict = PythonOperator(
            task_id=f'load_and_predict_{hazard}',
            python_callable=load_and_predict,
            op_kwargs={'hazard_type': hazard},
        )

        t_shap = PythonOperator(
            task_id=f'compute_shap_{hazard}',
            python_callable=compute_shap_values,
            op_kwargs={'hazard_type': hazard},
        )

        t_push = PythonOperator(
            task_id=f'push_predictions_{hazard}',
            python_callable=push_predictions_to_backend,
            op_kwargs={'hazard_type': hazard},
        )

        t_get_prod >> t_predict >> t_shap >> t_push
