import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Phase 5.4 — Advanced Reporting Schema
 *
 * Creates the `reporting` schema with:
 *   - report_definitions — saved report templates (type, query spec, schedule, delivery)
 *   - report_executions  — audit log of every report run (status, artifact, inline result)
 */
export class ReportingSchema1712300009000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE SCHEMA IF NOT EXISTS reporting`);

    // ── Enum types ──────────────────────────────────────────────────────────
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE reporting.report_type AS ENUM (
          'incident_statistical','cross_domain','risk_forecast_summary',
          'resource_utilisation','response_time_analysis','custom'
        );
      EXCEPTION WHEN duplicate_object THEN NULL; END $$
    `);
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE reporting.report_format AS ENUM ('json','pdf','csv','xlsx');
      EXCEPTION WHEN duplicate_object THEN NULL; END $$
    `);
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE reporting.report_status AS ENUM ('pending','running','complete','failed');
      EXCEPTION WHEN duplicate_object THEN NULL; END $$
    `);
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE reporting.delivery_channel AS ENUM ('download','email','webhook');
      EXCEPTION WHEN duplicate_object THEN NULL; END $$
    `);

    // ── report_definitions ────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE reporting.report_definitions (
        id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name             VARCHAR(200) NOT NULL,
        description      TEXT,
        report_type      reporting.report_type NOT NULL,
        query_spec       JSONB NOT NULL DEFAULT '{}',
        default_format   reporting.report_format NOT NULL DEFAULT 'json',
        is_scheduled     BOOLEAN NOT NULL DEFAULT FALSE,
        cron_expression  VARCHAR(100),
        delivery_channel reporting.delivery_channel NOT NULL DEFAULT 'download',
        delivery_config  JSONB NOT NULL DEFAULT '{}',
        classification   SMALLINT NOT NULL DEFAULT 1,
        owner_id         UUID NOT NULL,
        is_active        BOOLEAN NOT NULL DEFAULT TRUE,
        created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await queryRunner.query(`CREATE INDEX idx_report_defs_type ON reporting.report_definitions (report_type)`);
    await queryRunner.query(`CREATE INDEX idx_report_defs_scheduled ON reporting.report_definitions (is_scheduled) WHERE is_scheduled = TRUE`);

    // ── report_executions ─────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE reporting.report_executions (
        id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        definition_id    UUID NOT NULL REFERENCES reporting.report_definitions (id) ON DELETE CASCADE,
        status           reporting.report_status NOT NULL DEFAULT 'pending',
        parameters       JSONB NOT NULL DEFAULT '{}',
        format           reporting.report_format NOT NULL DEFAULT 'json',
        artifact_key     VARCHAR(500),
        download_url     VARCHAR(1000),
        inline_result    JSONB,
        row_count        INTEGER,
        file_size_bytes  BIGINT,
        started_at       TIMESTAMPTZ,
        completed_at     TIMESTAMPTZ,
        duration_ms      INTEGER,
        error_message    TEXT,
        triggered_by_id  UUID,
        trigger_source   VARCHAR(30) NOT NULL DEFAULT 'manual',
        delivery_channel reporting.delivery_channel NOT NULL DEFAULT 'download',
        delivered_at     TIMESTAMPTZ,
        created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await queryRunner.query(`
      CREATE INDEX idx_report_execs_def_date
        ON reporting.report_executions (definition_id, created_at DESC)
    `);
    await queryRunner.query(`
      CREATE INDEX idx_report_execs_status
        ON reporting.report_executions (status)
    `);
    await queryRunner.query(`
      CREATE INDEX idx_report_execs_triggered_by
        ON reporting.report_executions (triggered_by_id)
        WHERE triggered_by_id IS NOT NULL
    `);

    // ── updated_at triggers ───────────────────────────────────────────────
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION reporting.set_updated_at()
      RETURNS TRIGGER LANGUAGE plpgsql AS $$
      BEGIN NEW.updated_at = NOW(); RETURN NEW; END; $$
    `);
    for (const tbl of ['report_definitions', 'report_executions']) {
      await queryRunner.query(`
        CREATE TRIGGER trg_${tbl}_updated_at
          BEFORE UPDATE ON reporting.${tbl}
          FOR EACH ROW EXECUTE FUNCTION reporting.set_updated_at()
      `);
    }

    // ── Seed: built-in report definitions ─────────────────────────────────
    await queryRunner.query(`
      INSERT INTO reporting.report_definitions
        (name, description, report_type, query_spec, default_format, is_scheduled,
         cron_expression, delivery_channel, classification, owner_id)
      VALUES
        (
          'Weekly Incident Statistical Report',
          'Incident counts, resolution rates, and response times grouped by type',
          'incident_statistical',
          '{"groupBy":"type","dateFrom":"-7d"}',
          'json',
          TRUE,
          '0 6 * * 1',
          'download',
          1,
          '00000000-0000-0000-0000-000000000001'
        ),
        (
          'Monthly Cross-Domain Analytics',
          'Correlates incidents, tasks, and EDMS documents per administrative unit',
          'cross_domain',
          '{"dateFrom":"-30d"}',
          'json',
          TRUE,
          '0 6 1 * *',
          'download',
          1,
          '00000000-0000-0000-0000-000000000001'
        ),
        (
          'Daily Risk Forecast Summary',
          'Published and pending ML risk predictions aggregated by hazard type and tier',
          'risk_forecast_summary',
          '{}',
          'json',
          TRUE,
          '0 6 * * *',
          'download',
          1,
          '00000000-0000-0000-0000-000000000001'
        ),
        (
          'Response Time Analysis',
          'P25/P50/P90 response times per incident type and severity',
          'response_time_analysis',
          '{"dateFrom":"-90d"}',
          'json',
          FALSE,
          NULL,
          'download',
          1,
          '00000000-0000-0000-0000-000000000001'
        ),
        (
          'Resource Utilisation Report',
          'Deployment counts, quantities, and cost estimates per resource type',
          'resource_utilisation',
          '{"dateFrom":"-30d"}',
          'json',
          FALSE,
          NULL,
          'download',
          1,
          '00000000-0000-0000-0000-000000000001'
        )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP SCHEMA IF EXISTS reporting CASCADE`);
  }
}
