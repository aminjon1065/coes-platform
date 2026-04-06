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
      ALTER TABLE edms.workflow_templates
        ADD COLUMN IF NOT EXISTS owner_department_id UUID NULL
          REFERENCES org.departments(id) ON DELETE SET NULL;

      CREATE INDEX IF NOT EXISTS idx_wt_owner_dept
        ON edms.workflow_templates (owner_department_id)
        WHERE owner_department_id IS NOT NULL;

      COMMENT ON COLUMN edms.workflow_templates.owner_department_id
        IS 'NULL = platform-wide template; set = department-scoped template managed by dept admin';
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE edms.workflow_templates
        DROP COLUMN IF EXISTS owner_department_id;
    `);
  }
}
