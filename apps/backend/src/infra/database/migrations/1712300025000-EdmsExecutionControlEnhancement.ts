import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * EDMS Execution Control Enhancement — Section 9 (EDMS-and-Workflow-Architecture.md)
 *
 * 1. executor_assignments.parent_assignment_id  — sub-assignment support (§9.4)
 * 2. edms.deadline_extension_requests           — formal deadline extension flow (§9.6)
 */
export class EdmsExecutionControlEnhancement1712300025000 implements MigrationInterface {
  name = 'EdmsExecutionControlEnhancement1712300025000';

  async up(queryRunner: QueryRunner): Promise<void> {
    // ── 1. Sub-assignment support (§9.4) ─────────────────────────────────────
    await queryRunner.query(`
      ALTER TABLE edms.executor_assignments
        ADD COLUMN IF NOT EXISTS parent_assignment_id UUID NULL
          REFERENCES edms.executor_assignments(id) ON DELETE SET NULL;

      CREATE INDEX IF NOT EXISTS idx_executor_assignments_parent
        ON edms.executor_assignments (parent_assignment_id)
        WHERE parent_assignment_id IS NOT NULL;

      COMMENT ON COLUMN edms.executor_assignments.parent_assignment_id IS
        'Set when this is a sub-assignment. Sub-delegation is capped at one level (§9.4).';
    `);

    // ── 2. deadline_extension_status enum ────────────────────────────────────
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_type WHERE typname = 'deadline_extension_status'
        ) THEN
          CREATE TYPE edms.deadline_extension_status AS ENUM (
            'pending',
            'approved',
            'denied'
          );
        END IF;
      END $$;
    `);

    // ── 3. deadline_extension_requests table (§9.6) ───────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS edms.deadline_extension_requests (
        id                      UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
        assignment_id           UUID          NOT NULL
          REFERENCES edms.executor_assignments(id) ON DELETE CASCADE,
        document_id             UUID          NOT NULL,
        requester_position_id   UUID          NOT NULL,
        requester_id            UUID          NOT NULL,
        current_deadline        DATE          NOT NULL,
        requested_deadline      DATE          NOT NULL,
        justification           TEXT          NOT NULL,
        status                  edms.deadline_extension_status
                                              NOT NULL DEFAULT 'pending',
        reviewed_by_position_id UUID          NULL,
        reviewed_by_id          UUID          NULL,
        review_remarks          TEXT          NULL,
        reviewed_at             TIMESTAMPTZ   NULL,
        created_at              TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

        CONSTRAINT chk_extension_deadline CHECK (requested_deadline > current_deadline)
      );

      CREATE INDEX IF NOT EXISTS idx_deadline_ext_assignment_status
        ON edms.deadline_extension_requests (assignment_id, status);

      CREATE INDEX IF NOT EXISTS idx_deadline_ext_document_status
        ON edms.deadline_extension_requests (document_id, status);

      COMMENT ON TABLE edms.deadline_extension_requests IS
        'Formal extension requests for executor assignment deadlines. §9.6';
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS edms.deadline_extension_requests;`);
    await queryRunner.query(`DROP TYPE IF EXISTS edms.deadline_extension_status;`);
    await queryRunner.query(`
      ALTER TABLE edms.executor_assignments
        DROP COLUMN IF EXISTS parent_assignment_id;
    `);
  }
}
