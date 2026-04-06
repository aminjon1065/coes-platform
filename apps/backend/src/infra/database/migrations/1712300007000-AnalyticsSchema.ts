import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Phase 4.3 — Emergency Analytics Schema
 *
 * Tables live in the existing `analytics` PostgreSQL schema (main postgres instance).
 * reported_at columns are set up for time-partitioning via TimescaleDB once the
 * analytics data is migrated to the dedicated TimescaleDB service (Phase 5+).
 *
 * TimescaleDB hypertable commands are commented-out below for reference; they can
 * be run after migration to the TimescaleDB service.
 */
export class AnalyticsSchema1712300007000 implements MigrationInterface {
  name = 'AnalyticsSchema1712300007000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE SCHEMA IF NOT EXISTS analytics`);

    // ── Enums ──────────────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TYPE analytics.incident_status AS ENUM (
        'open', 'responding', 'contained', 'resolved', 'closed', 'cancelled'
      )
    `);
    await queryRunner.query(`
      CREATE TYPE analytics.incident_severity AS ENUM (
        'minor', 'moderate', 'major', 'catastrophic'
      )
    `);
    await queryRunner.query(`
      CREATE TYPE analytics.response_action AS ENUM (
        'dispatched', 'on_scene', 'evacuated', 'contained', 'remediated',
        'assessment_completed', 'report_filed', 'resources_released'
      )
    `);
    await queryRunner.query(`
      CREATE TYPE analytics.resource_type AS ENUM (
        'personnel', 'vehicle', 'equipment', 'medical', 'shelter',
        'food_water', 'communication', 'aerial', 'other'
      )
    `);
    await queryRunner.query(`
      CREATE TYPE analytics.form_status AS ENUM (
        'draft', 'published', 'archived'
      )
    `);
    await queryRunner.query(`
      CREATE TYPE analytics.submission_status AS ENUM (
        'submitted', 'under_review', 'accepted', 'rejected', 'requires_revision'
      )
    `);
    await queryRunner.query(`
      CREATE TYPE analytics.report_format AS ENUM (
        'json', 'csv', 'pdf', 'xlsx'
      )
    `);

    // ── analytics.incidents ────────────────────────────────────────────────
    // Canonical analytical record per emergency incident.
    // Linked to gis.incident_locations via incident_ref (not FK — cross-domain).
    await queryRunner.query(`
      CREATE TABLE analytics.incidents (
        id                    UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
        incident_ref          VARCHAR(100)    NOT NULL UNIQUE,  -- shared with gis domain
        title                 VARCHAR(300)    NOT NULL,
        incident_type         VARCHAR(100)    NOT NULL,
        severity              analytics.incident_severity NOT NULL DEFAULT 'moderate',
        status                analytics.incident_status   NOT NULL DEFAULT 'open',
        administrative_code   VARCHAR(20)     NULL,     -- oblast/rayon code
        administrative_name   VARCHAR(200)    NULL,
        -- Spatial summary (denormalised for query convenience; source of truth is gis schema)
        latitude              NUMERIC(10, 7)  NULL,
        longitude             NUMERIC(10, 7)  NULL,
        affected_area_km2     NUMERIC(12, 4)  NULL,
        -- Impact assessment
        affected_population   INTEGER         NULL,
        casualties_confirmed  INTEGER         NOT NULL DEFAULT 0,
        casualties_suspected  INTEGER         NOT NULL DEFAULT 0,
        infrastructure_damage JSONB           NOT NULL DEFAULT '{}',
        -- Timeline
        reported_at           TIMESTAMPTZ     NOT NULL,
        first_response_at     TIMESTAMPTZ     NULL,
        contained_at          TIMESTAMPTZ     NULL,
        resolved_at           TIMESTAMPTZ     NULL,
        closed_at             TIMESTAMPTZ     NULL,
        -- Derived metrics (computed and cached)
        response_time_minutes INTEGER         NULL  GENERATED ALWAYS AS (
          CASE WHEN first_response_at IS NOT NULL
               THEN EXTRACT(EPOCH FROM (first_response_at - reported_at)) / 60
          END::int
        ) STORED,
        resolution_time_hours NUMERIC(10, 2)  NULL  GENERATED ALWAYS AS (
          CASE WHEN resolved_at IS NOT NULL
               THEN EXTRACT(EPOCH FROM (resolved_at - reported_at)) / 3600
          END
        ) STORED,
        -- Classification & ownership
        classification        SMALLINT        NOT NULL DEFAULT 0
                              CHECK (classification BETWEEN 0 AND 3),
        responsible_dept_id   UUID            NULL,
        reported_by_id        UUID            NOT NULL,
        lead_responder_id     UUID            NULL,
        -- Linked documents and tasks
        edms_document_ids     UUID[]          NOT NULL DEFAULT '{}',
        task_ids              UUID[]          NOT NULL DEFAULT '{}',
        -- Extra attributes (hazard-type specific payload)
        attributes            JSONB           NOT NULL DEFAULT '{}',
        internal_notes        TEXT            NULL,
        created_at            TIMESTAMPTZ     NOT NULL DEFAULT now(),
        updated_at            TIMESTAMPTZ     NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`
      CREATE INDEX idx_incidents_type       ON analytics.incidents (incident_type);
      CREATE INDEX idx_incidents_severity   ON analytics.incidents (severity);
      CREATE INDEX idx_incidents_status     ON analytics.incidents (status);
      CREATE INDEX idx_incidents_admin      ON analytics.incidents (administrative_code)
        WHERE administrative_code IS NOT NULL;
      CREATE INDEX idx_incidents_reported   ON analytics.incidents (reported_at DESC);
      CREATE INDEX idx_incidents_open       ON analytics.incidents (reported_at)
        WHERE status NOT IN ('closed', 'cancelled');
      CREATE INDEX idx_incidents_attrs      ON analytics.incidents USING GIN (attributes);
      -- BRIN index for time-range queries (efficient for append-heavy tables)
      CREATE INDEX idx_incidents_reported_brin ON analytics.incidents
        USING BRIN (reported_at) WITH (pages_per_range = 128);
    `);
    /* TimescaleDB migration (run after migrating to dedicated TimescaleDB service):
       SELECT create_hypertable('analytics.incidents', 'reported_at',
         chunk_time_interval => INTERVAL '1 month'); */

    // ── analytics.incident_responses ──────────────────────────────────────
    // Append-only timeline of response actions for each incident.
    await queryRunner.query(`
      CREATE TABLE analytics.incident_responses (
        id              UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
        incident_id     UUID            NOT NULL REFERENCES analytics.incidents(id) ON DELETE CASCADE,
        action          analytics.response_action NOT NULL,
        description     TEXT            NULL,
        location_note   VARCHAR(300)    NULL,
        occurred_at     TIMESTAMPTZ     NOT NULL DEFAULT now(),
        recorded_by_id  UUID            NOT NULL,
        resources_used  JSONB           NOT NULL DEFAULT '[]',  -- [{type, count, unit}]
        outcome         VARCHAR(500)    NULL,
        created_at      TIMESTAMPTZ     NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`
      CREATE INDEX idx_incident_responses_incident ON analytics.incident_responses (incident_id);
      CREATE INDEX idx_incident_responses_occurred ON analytics.incident_responses (occurred_at DESC);
      CREATE INDEX idx_incident_responses_brin     ON analytics.incident_responses
        USING BRIN (occurred_at) WITH (pages_per_range = 128);
    `);
    /* TimescaleDB migration:
       SELECT create_hypertable('analytics.incident_responses', 'occurred_at',
         chunk_time_interval => INTERVAL '1 month'); */

    // ── analytics.resource_deployments ────────────────────────────────────
    // Resources deployed per incident (tracks utilisation).
    await queryRunner.query(`
      CREATE TABLE analytics.resource_deployments (
        id              UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
        incident_id     UUID            NOT NULL REFERENCES analytics.incidents(id) ON DELETE CASCADE,
        resource_type   analytics.resource_type NOT NULL,
        resource_name   VARCHAR(200)    NOT NULL,
        quantity        INTEGER         NOT NULL DEFAULT 1 CHECK (quantity > 0),
        unit            VARCHAR(50)     NULL,       -- 'people', 'vehicles', 'tonnes', etc.
        dept_id         UUID            NULL,
        deployed_at     TIMESTAMPTZ     NOT NULL DEFAULT now(),
        withdrawn_at    TIMESTAMPTZ     NULL,       -- NULL = still deployed
        cost_estimate   NUMERIC(14, 2)  NULL,
        notes           TEXT            NULL,
        created_by_id   UUID            NOT NULL,
        created_at      TIMESTAMPTZ     NOT NULL DEFAULT now(),
        updated_at      TIMESTAMPTZ     NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`
      CREATE INDEX idx_resource_deployments_incident ON analytics.resource_deployments (incident_id);
      CREATE INDEX idx_resource_deployments_type     ON analytics.resource_deployments (resource_type);
      CREATE INDEX idx_resource_deployments_active   ON analytics.resource_deployments (incident_id)
        WHERE withdrawn_at IS NULL;
    `);

    // ── analytics.data_collection_forms ───────────────────────────────────
    // Structured form templates for field analyst data entry.
    await queryRunner.query(`
      CREATE TABLE analytics.data_collection_forms (
        id              UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
        name            VARCHAR(200)    NOT NULL,
        description     TEXT            NULL,
        incident_type   VARCHAR(100)    NULL,       -- NULL = generic form
        version         INTEGER         NOT NULL DEFAULT 1,
        status          analytics.form_status NOT NULL DEFAULT 'draft',
        fields          JSONB           NOT NULL,   -- [{name, type, label, required, options}]
        classification  SMALLINT        NOT NULL DEFAULT 0
                        CHECK (classification BETWEEN 0 AND 3),
        created_by_id   UUID            NOT NULL,
        published_at    TIMESTAMPTZ     NULL,
        archived_at     TIMESTAMPTZ     NULL,
        created_at      TIMESTAMPTZ     NOT NULL DEFAULT now(),
        updated_at      TIMESTAMPTZ     NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`
      CREATE INDEX idx_dcf_incident_type ON analytics.data_collection_forms (incident_type)
        WHERE incident_type IS NOT NULL;
      CREATE INDEX idx_dcf_status        ON analytics.data_collection_forms (status);
    `);

    // ── analytics.form_submissions ────────────────────────────────────────
    // Field-level data submitted via forms; linked to incidents.
    await queryRunner.query(`
      CREATE TABLE analytics.form_submissions (
        id              UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
        form_id         UUID            NOT NULL REFERENCES analytics.data_collection_forms(id),
        incident_id     UUID            NULL REFERENCES analytics.incidents(id),
        incident_ref    VARCHAR(100)    NULL,       -- fallback if incident not yet registered
        status          analytics.submission_status NOT NULL DEFAULT 'submitted',
        data            JSONB           NOT NULL,   -- field values keyed by field name
        location_lat    NUMERIC(10, 7)  NULL,
        location_lon    NUMERIC(10, 7)  NULL,
        submitted_by_id UUID            NOT NULL,
        reviewed_by_id  UUID            NULL,
        review_notes    TEXT            NULL,
        submitted_at    TIMESTAMPTZ     NOT NULL DEFAULT now(),
        reviewed_at     TIMESTAMPTZ     NULL,
        created_at      TIMESTAMPTZ     NOT NULL DEFAULT now(),
        updated_at      TIMESTAMPTZ     NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`
      CREATE INDEX idx_form_submissions_form     ON analytics.form_submissions (form_id);
      CREATE INDEX idx_form_submissions_incident ON analytics.form_submissions (incident_id)
        WHERE incident_id IS NOT NULL;
      CREATE INDEX idx_form_submissions_status   ON analytics.form_submissions (status);
      CREATE INDEX idx_form_submissions_subm_at  ON analytics.form_submissions (submitted_at DESC);
      CREATE INDEX idx_form_submissions_brin     ON analytics.form_submissions
        USING BRIN (submitted_at) WITH (pages_per_range = 128);
    `);

    // ── analytics.metrics_snapshots ──────────────────────────────────────
    // Pre-computed periodic metric snapshots for dashboard display.
    await queryRunner.query(`
      CREATE TABLE analytics.metrics_snapshots (
        id              UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
        snapshot_at     TIMESTAMPTZ     NOT NULL DEFAULT now(),
        period          VARCHAR(20)     NOT NULL,   -- 'daily', 'weekly', 'monthly'
        administrative_code VARCHAR(20) NULL,       -- NULL = national aggregate
        incident_type   VARCHAR(100)    NULL,       -- NULL = all types
        metrics         JSONB           NOT NULL,
        -- Metrics payload example:
        -- { "total_incidents": 12, "open_incidents": 3, "avg_response_min": 47,
        --   "avg_resolution_hrs": 18.4, "total_affected_population": 1240,
        --   "resource_deployments": 8, "p50_response_min": 38, "p90_response_min": 120 }
        created_at      TIMESTAMPTZ     NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`
      CREATE INDEX idx_metrics_snapshots_at     ON analytics.metrics_snapshots (snapshot_at DESC);
      CREATE INDEX idx_metrics_snapshots_period ON analytics.metrics_snapshots (period, snapshot_at DESC);
      CREATE INDEX idx_metrics_snapshots_admin  ON analytics.metrics_snapshots (administrative_code)
        WHERE administrative_code IS NOT NULL;
      CREATE UNIQUE INDEX uq_metrics_snapshots
        ON analytics.metrics_snapshots (period, snapshot_at, administrative_code, incident_type)
        WHERE administrative_code IS NOT NULL AND incident_type IS NOT NULL;
      CREATE INDEX idx_metrics_snapshots_brin   ON analytics.metrics_snapshots
        USING BRIN (snapshot_at) WITH (pages_per_range = 128);
    `);
    /* TimescaleDB migration:
       SELECT create_hypertable('analytics.metrics_snapshots', 'snapshot_at',
         chunk_time_interval => INTERVAL '1 month'); */

    // ── analytics.generated_reports ──────────────────────────────────────
    // Archive of generated analytical reports.
    await queryRunner.query(`
      CREATE TABLE analytics.generated_reports (
        id              UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
        title           VARCHAR(300)    NOT NULL,
        report_type     VARCHAR(100)    NOT NULL,   -- 'incident_summary', 'response_perf', etc.
        parameters      JSONB           NOT NULL DEFAULT '{}',
        format          analytics.report_format NOT NULL DEFAULT 'json',
        period_from     TIMESTAMPTZ     NULL,
        period_to       TIMESTAMPTZ     NULL,
        storage_key     VARCHAR(500)    NULL,       -- MinIO key for file-based reports
        row_count       INTEGER         NULL,
        file_size_bytes BIGINT          NULL,
        status          VARCHAR(20)     NOT NULL DEFAULT 'generating',
        error_message   TEXT            NULL,
        classification  SMALLINT        NOT NULL DEFAULT 0
                        CHECK (classification BETWEEN 0 AND 3),
        requested_by_id UUID            NOT NULL,
        generated_at    TIMESTAMPTZ     NULL,
        expires_at      TIMESTAMPTZ     NULL,
        created_at      TIMESTAMPTZ     NOT NULL DEFAULT now(),
        updated_at      TIMESTAMPTZ     NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`
      CREATE INDEX idx_generated_reports_type    ON analytics.generated_reports (report_type);
      CREATE INDEX idx_generated_reports_by      ON analytics.generated_reports (requested_by_id);
      CREATE INDEX idx_generated_reports_created ON analytics.generated_reports (created_at DESC);
    `);

    // ── Trigger: updated_at ────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION analytics.set_updated_at()
      RETURNS TRIGGER LANGUAGE plpgsql AS $$
      BEGIN NEW.updated_at = now(); RETURN NEW; END;
      $$
    `);
    for (const tbl of [
      'incidents', 'resource_deployments', 'data_collection_forms',
      'form_submissions', 'generated_reports',
    ]) {
      await queryRunner.query(`
        CREATE TRIGGER trg_${tbl}_updated_at
          BEFORE UPDATE ON analytics.${tbl}
          FOR EACH ROW EXECUTE FUNCTION analytics.set_updated_at()
      `);
    }

    // ── Views for common dashboard queries ────────────────────────────────
    await queryRunner.query(`
      CREATE VIEW analytics.v_open_incidents AS
      SELECT
        id, incident_ref, title, incident_type, severity, status,
        administrative_code, administrative_name,
        reported_at, first_response_at, response_time_minutes,
        casualties_confirmed, affected_population,
        responsible_dept_id, lead_responder_id
      FROM analytics.incidents
      WHERE status NOT IN ('closed', 'cancelled')
      ORDER BY
        CASE severity
          WHEN 'catastrophic' THEN 1
          WHEN 'major'        THEN 2
          WHEN 'moderate'     THEN 3
          WHEN 'minor'        THEN 4
        END,
        reported_at DESC
    `);

    await queryRunner.query(`
      CREATE VIEW analytics.v_incident_response_summary AS
      SELECT
        i.id,
        i.incident_ref,
        i.incident_type,
        i.severity,
        i.status,
        i.administrative_code,
        i.reported_at,
        i.response_time_minutes,
        i.resolution_time_hours,
        COUNT(r.id)                           AS response_action_count,
        COUNT(DISTINCT d.id)                  AS resource_deployment_count,
        COALESCE(SUM(d.quantity), 0)          AS total_resources_deployed,
        COALESCE(SUM(d.cost_estimate), 0)     AS total_cost_estimate
      FROM analytics.incidents i
      LEFT JOIN analytics.incident_responses  r ON r.incident_id = i.id
      LEFT JOIN analytics.resource_deployments d ON d.incident_id = i.id
      GROUP BY i.id
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP VIEW IF EXISTS analytics.v_incident_response_summary`);
    await queryRunner.query(`DROP VIEW IF EXISTS analytics.v_open_incidents`);
    await queryRunner.query(`DROP SCHEMA IF EXISTS analytics CASCADE`);
  }
}
