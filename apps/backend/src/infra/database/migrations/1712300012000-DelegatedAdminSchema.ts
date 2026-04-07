import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Phase 6.3 — Delegated Administration Schema
 *
 * Adds owner_department_id to edms.workflow_templates so that
 * department admins can manage per-department workflow templates.
 */
export class DelegatedAdminSchema1712300012000 implements MigrationInterface {
  name = 'DelegatedAdminSchema1712300012000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS edms.workflow_templates (
        id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name                VARCHAR(200) NOT NULL,
        description         TEXT NULL,
        document_type_id    UUID NOT NULL REFERENCES edms.document_types(id) ON DELETE RESTRICT,
        version             INTEGER NOT NULL DEFAULT 1,
        active              BOOLEAN NOT NULL DEFAULT TRUE,
        owner_department_id UUID NULL REFERENCES org.departments(id) ON DELETE SET NULL,
        created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      ALTER TABLE edms.workflow_templates
        ADD COLUMN IF NOT EXISTS owner_department_id UUID NULL
          REFERENCES org.departments(id) ON DELETE SET NULL;

      CREATE INDEX IF NOT EXISTS idx_workflow_templates_document_type
        ON edms.workflow_templates (document_type_id);

      CREATE INDEX IF NOT EXISTS idx_wt_owner_dept
        ON edms.workflow_templates (owner_department_id)
        WHERE owner_department_id IS NOT NULL;

      COMMENT ON COLUMN edms.workflow_templates.owner_department_id
        IS 'NULL = platform-wide template; set = department-scoped template managed by dept admin';
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS edms.idx_wt_owner_dept;
      DROP INDEX IF EXISTS edms.idx_workflow_templates_document_type;

      ALTER TABLE IF EXISTS edms.workflow_templates
        DROP COLUMN IF EXISTS owner_department_id;
    `);
  }
}
