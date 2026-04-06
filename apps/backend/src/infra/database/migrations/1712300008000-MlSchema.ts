import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Phase 5.1 — ML Infrastructure Schema
 *
 * Creates the `ml` schema with:
 *   - ml_models          — model registry (one entry per hazard model)
 *   - ml_model_versions  — versioned artefacts with MLflow cross-reference
 *   - risk_predictions   — per-admin-unit scored predictions pending HITL review
 *   - feature_definitions — feature store catalogue
 *   - model_performance_snapshots — drift + accuracy monitoring history
 */
export class MlSchema1712300008000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── Schema ─────────────────────────────────────────────────────────────────
    await queryRunner.query(`CREATE SCHEMA IF NOT EXISTS ml`);

    // ── Enum types ─────────────────────────────────────────────────────────────
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE ml.hazard_type AS ENUM ('flood','landslide','seismic','wildfire');
      EXCEPTION WHEN duplicate_object THEN NULL; END $$
    `);
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE ml.model_framework AS ENUM ('xgboost','lightgbm','sklearn','pytorch');
      EXCEPTION WHEN duplicate_object THEN NULL; END $$
    `);
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE ml.model_version_status AS ENUM
          ('training','staging','production','archived','failed');
      EXCEPTION WHEN duplicate_object THEN NULL; END $$
    `);
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE ml.prediction_status AS ENUM
          ('pending','approved','rejected','published','expired');
      EXCEPTION WHEN duplicate_object THEN NULL; END $$
    `);
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE ml.feature_value_type AS ENUM ('float','integer','boolean','category');
      EXCEPTION WHEN duplicate_object THEN NULL; END $$
    `);
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE ml.feature_source_domain AS ENUM ('gis','analytics','weather','derived');
      EXCEPTION WHEN duplicate_object THEN NULL; END $$
    `);
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE ml.drift_severity AS ENUM ('none','low','moderate','high');
      EXCEPTION WHEN duplicate_object THEN NULL; END $$
    `);

    // ── ml_models ──────────────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE ml.ml_models (
        id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name                  VARCHAR(120) NOT NULL UNIQUE,
        description           TEXT,
        hazard_type           ml.hazard_type NOT NULL,
        framework             ml.model_framework NOT NULL DEFAULT 'xgboost',
        feature_names         JSONB NOT NULL DEFAULT '[]',
        preprocessing_config  JSONB NOT NULL DEFAULT '{}',
        is_active             BOOLEAN NOT NULL DEFAULT TRUE,
        classification        SMALLINT NOT NULL DEFAULT 1,
        created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await queryRunner.query(`CREATE INDEX idx_ml_models_hazard_type ON ml.ml_models (hazard_type)`);
    await queryRunner.query(`CREATE INDEX idx_ml_models_is_active   ON ml.ml_models (is_active)`);

    // ── ml_model_versions ─────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE ml.ml_model_versions (
        id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        model_id                  UUID NOT NULL REFERENCES ml.ml_models (id) ON DELETE CASCADE,
        version                   VARCHAR(30) NOT NULL,
        status                    ml.model_version_status NOT NULL DEFAULT 'training',
        mlflow_run_id             VARCHAR(64),
        mlflow_version            INTEGER,
        artifact_uri              VARCHAR(500),
        training_dataset_meta     JSONB NOT NULL DEFAULT '{}',
        hyperparameters           JSONB NOT NULL DEFAULT '{}',
        eval_metrics              JSONB NOT NULL DEFAULT '{}',
        feature_importances       JSONB NOT NULL DEFAULT '{}',
        reviewed_by_id            UUID,
        reviewed_at               TIMESTAMPTZ,
        review_notes              TEXT,
        promoted_to_production_at TIMESTAMPTZ,
        archived_at               TIMESTAMPTZ,
        created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (model_id, version)
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX idx_ml_versions_mlflow_run
        ON ml.ml_model_versions (mlflow_run_id)
        WHERE mlflow_run_id IS NOT NULL
    `);
    await queryRunner.query(`
      CREATE INDEX idx_ml_versions_model_status
        ON ml.ml_model_versions (model_id, status)
    `);

    // ── risk_predictions ──────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE ml.risk_predictions (
        id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        model_version_id    UUID NOT NULL REFERENCES ml.ml_model_versions (id),
        hazard_type         ml.hazard_type NOT NULL,
        administrative_code VARCHAR(20) NOT NULL,
        administrative_name VARCHAR(200),
        risk_score          NUMERIC(6,4) NOT NULL,
        risk_tier           SMALLINT NOT NULL CHECK (risk_tier BETWEEN 1 AND 4),
        shap_values         JSONB NOT NULL DEFAULT '{}',
        input_features      JSONB NOT NULL DEFAULT '{}',
        confidence_interval JSONB,
        valid_from          TIMESTAMPTZ NOT NULL,
        valid_until         TIMESTAMPTZ NOT NULL,
        status              ml.prediction_status NOT NULL DEFAULT 'pending',
        reviewed_by_id      UUID,
        reviewed_at         TIMESTAMPTZ,
        review_notes        TEXT,
        classification      SMALLINT NOT NULL DEFAULT 1,
        predicted_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT chk_risk_score CHECK (risk_score >= 0 AND risk_score <= 1),
        CONSTRAINT chk_valid_window CHECK (valid_until > valid_from)
      )
    `);
    await queryRunner.query(`
      CREATE INDEX idx_risk_predictions_hazard_status
        ON ml.risk_predictions (hazard_type, status)
    `);
    await queryRunner.query(`
      CREATE INDEX idx_risk_predictions_admin_code
        ON ml.risk_predictions (administrative_code)
    `);
    await queryRunner.query(`
      CREATE INDEX idx_risk_predictions_predicted_at
        ON ml.risk_predictions (predicted_at DESC)
    `);
    await queryRunner.query(`
      CREATE INDEX idx_risk_predictions_model_version
        ON ml.risk_predictions (model_version_id)
    `);

    // ── feature_definitions ───────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE ml.feature_definitions (
        id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name             VARCHAR(120) NOT NULL UNIQUE,
        description      TEXT,
        value_type       ml.feature_value_type NOT NULL DEFAULT 'float',
        source_domain    ml.feature_source_domain NOT NULL,
        computation_spec JSONB NOT NULL DEFAULT '{}',
        valid_range      JSONB,
        categories       JSONB,
        ttl_seconds      INTEGER,
        is_active        BOOLEAN NOT NULL DEFAULT TRUE,
        created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await queryRunner.query(`
      CREATE INDEX idx_feature_definitions_source
        ON ml.feature_definitions (source_domain)
    `);

    // ── model_performance_snapshots ───────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE ml.model_performance_snapshots (
        id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        model_version_id  UUID NOT NULL REFERENCES ml.ml_model_versions (id),
        window_start      TIMESTAMPTZ NOT NULL,
        window_end        TIMESTAMPTZ NOT NULL,
        prediction_count  INTEGER NOT NULL DEFAULT 0,
        accuracy_metrics  JSONB,
        feature_drift     JSONB NOT NULL DEFAULT '{}',
        max_psi           NUMERIC(8,4),
        drift_severity    ml.drift_severity NOT NULL DEFAULT 'none',
        score_distribution JSONB NOT NULL DEFAULT '{}',
        alert_triggered   BOOLEAN NOT NULL DEFAULT FALSE,
        alert_details     JSONB,
        snapshot_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await queryRunner.query(`
      CREATE INDEX idx_perf_snapshots_version_at
        ON ml.model_performance_snapshots (model_version_id, snapshot_at DESC)
    `);

    // ── updated_at trigger ────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION ml.set_updated_at()
      RETURNS TRIGGER LANGUAGE plpgsql AS $$
      BEGIN NEW.updated_at = NOW(); RETURN NEW; END; $$
    `);
    for (const tbl of ['ml_models', 'ml_model_versions', 'feature_definitions']) {
      await queryRunner.query(`
        CREATE TRIGGER trg_${tbl.replace(/-/g, '_')}_updated_at
          BEFORE UPDATE ON ml.${tbl}
          FOR EACH ROW EXECUTE FUNCTION ml.set_updated_at()
      `);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP SCHEMA IF EXISTS ml CASCADE`);
  }
}
