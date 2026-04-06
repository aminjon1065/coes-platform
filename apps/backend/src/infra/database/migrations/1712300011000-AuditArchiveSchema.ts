import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Phase 6.2 — Audit Archive Schema
 *
 * Adds audit.audit_archives table for long-term cold storage of aged-out
 * audit events. Hot table (audit_events) retains 90 days; archive retains 7 years.
 */
export class AuditArchiveSchema1712300011000 implements MigrationInterface {
  name = 'AuditArchiveSchema1712300011000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS audit.audit_archives (
        id            UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
        original_id   UUID         NOT NULL,
        actor_id      UUID         NULL,
        actor_username VARCHAR(100) NULL,
        event_type    VARCHAR(100) NOT NULL,
        resource_type VARCHAR(100) NULL,
        resource_id   UUID         NULL,
        ip_address    VARCHAR(45)  NULL,
        success       BOOLEAN      NOT NULL DEFAULT TRUE,
        failure_reason VARCHAR(500) NULL,
        severity      VARCHAR(20)  NOT NULL DEFAULT 'info',
        metadata      JSONB        NULL,
        integrity_hash VARCHAR(64) NULL,
        occurred_at   TIMESTAMPTZ  NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_archive_actor_time
        ON audit.audit_archives (actor_id, occurred_at DESC)
        WHERE actor_id IS NOT NULL;

      CREATE INDEX IF NOT EXISTS idx_archive_event_time
        ON audit.audit_archives (event_type, occurred_at DESC);

      CREATE INDEX IF NOT EXISTS idx_archive_occurred_at
        ON audit.audit_archives (occurred_at DESC);

      COMMENT ON TABLE audit.audit_archives
        IS 'Cold storage for audit events older than 90 days. Purged after 7 years.';
    `);

    await queryRunner.query(`
      GRANT SELECT, INSERT ON audit.audit_archives TO coescd;
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS audit.audit_archives;`);
  }
}
