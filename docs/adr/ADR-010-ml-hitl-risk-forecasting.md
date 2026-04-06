# ADR-010: Human-in-the-Loop (HITL) for ML Risk Forecasting

**Date:** 2026-03-01
**Status:** Accepted
**Deciders:** Platform Architecture Team, Emergency Management Director

---

## Context

The platform's ML module produces risk predictions (flood, landslide, seismic, wildfire severity by administrative unit). These predictions inform:
- Resource pre-deployment decisions
- Evacuation zone pre-alerts
- Emergency declaration thresholds

Automatically acting on ML predictions without human review in a life-safety context is inappropriate. The question is how to structure the human oversight workflow.

Options:
1. **Fully automated:** ML predictions directly update the GIS risk layers and trigger alerts
2. **Fully manual:** ML outputs are advisory-only; dispatchers manually review and manually update risk layers
3. **Human-in-the-Loop (HITL):** ML predictions enter a review queue; analysts can approve/reject; approved predictions are published automatically; rejected predictions are flagged for model retraining

## Decision

**HITL with mandatory analyst review for `tier >= 3` predictions** (high/critical severity).

- `tier 1–2` predictions (low/medium): auto-published after 6-hour inference cycle (acceptable risk for non-evacuation-level events)
- `tier 3–4` predictions (high/critical): require analyst approval in the `ReviewPanel` before publication to the GIS risk layers
- SHAP explanations are provided per-prediction to give analysts the top-3 driving features

## Rationale

**Why HITL for tier 3–4?**

Emergency managers are legally and professionally responsible for evacuation orders and emergency declarations. Automated ML-triggered evacuations expose the agency to liability if the model is wrong. HITL shifts the decision authority back to human experts while still surfacing the ML signal efficiently.

**Why auto-publish tier 1–2?**

Requiring analyst review for every prediction would flood the review queue with low-importance updates (a "slightly elevated" flood risk for an already-monitored river segment). Analysts would stop reviewing meaningfully if the queue is always full. The threshold `tier >= 3` creates a manageable daily queue size (estimated 5–20 predictions per day requiring review).

**SHAP explanations:**

ML predictions for tier 3–4 include SHAP (SHapley Additive exPlanations) values identifying the top contributing features (e.g., "24h rainfall: +0.42", "soil saturation: +0.31", "slope gradient: +0.18"). This allows analysts to:
- Validate that the model is responding to physically plausible signals
- Reject predictions driven by data quality issues (e.g., a broken rain gauge)
- Document their reasoning in the `notes` field for the audit trail

**PSI drift monitoring:**

The ML pipeline monitors Population Stability Index (PSI) on each feature. PSI ≥ 0.25 on any feature triggers an automatic retraining DAG and a `MLModelDriftDetected` alert. This ensures the model degrades gracefully when feature distributions shift (e.g., after a sensor network upgrade that changes measurement ranges).

**Model versioning:**

All model versions are registered in MLflow and in the `ml_model_versions` table. The backend always loads the version marked `status = 'production'`. Promotion from `staging` to `production` requires an IAM user with the `ml:promote-model` permission — another HITL gate for model deployment.

## Consequences

- The `ReviewPanel` UI in the map client shows pending predictions with SHAP charts. Analysts must have the `ml:review` permission scoped to their area of responsibility.
- Auto-published tier 1–2 predictions can still be manually overridden by an analyst at any time.
- Rejected predictions are stored with the rejection reason and fed back to the retraining pipeline as negative labels.
- The HITL backlog (`coescd_ml_hitl_backlog` Prometheus metric) is alerted when > 10 predictions are pending for > 2 hours — indicating analyst capacity may be insufficient.
- A prediction older than 12 hours without review is auto-expired and re-queued on the next inference cycle with fresh data.
