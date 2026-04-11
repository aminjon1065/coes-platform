import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Tasks domain enhancements — Section 4 (4.Task-Management-Architecture.md)
 *
 * 1. tasks.tasks.source_assignment_id          — direct EDMS assignment reference (§4.3, §9.1)
 * 2. tasks.deadline_extension_requests         — formal deadline extension flow (§4.10, §17.3)
 */
export class TasksEnhancements1712300030000 implements MigrationInterface {
  name = 'TasksEnhancements1712300030000';

  async up(queryRunner: QueryRunner): Promise<void> {
    // ── 1. source_assignment_id on tasks ─────────────────────────────────────
    await queryRunner.query(`
      ALTER TABLE tasks.tasks
        ADD COLUMN IF NOT EXISTS source_assignment_id VARCHAR NULL;

      COMMENT ON COLUMN tasks.tasks.source_assignment_id IS
        'EDMS executor_assignment.id that generated this task. Only set for DOCUMENT_GENERATED tasks (§9.1).';

      CREATE INDEX IF NOT EXISTS idx_tasks_source_assignment
        ON tasks.tasks (source_assignment_id)
        WHERE source_assignment_id IS NOT NULL;
    `);

    // ── 2. deadline_extension_status enum ────────────────────────────────────
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_type t
          JOIN pg_namespace n ON n.oid = t.typnamespace
          WHERE t.typname = 'deadline_extension_status'
            AND n.nspname = 'tasks'
        ) THEN
          CREATE TYPE tasks.deadline_extension_status AS ENUM (
            'pending',
            'approved',
            'denied'
          );
        END IF;
      END $$;
    `);

    // ── 3. deadline_extension_requests table (§4.10, §17.3) ──────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS tasks.deadline_extension_requests (
        id                      UUID          PRIMARY KEY DEFAULT gen_random_uuid(),

        -- The task whose deadline is being extended
        task_id                 UUID          NOT NULL
          REFERENCES tasks.tasks(id) ON DELETE CASCADE,

        -- Who filed the request
        requester_position_id   VARCHAR       NOT NULL,
        requester_id            VARCHAR       NOT NULL,

        -- Deadline being extended and the requested new deadline
        current_deadline        DATE          NOT NULL,
        requested_deadline      DATE          NOT NULL,

        -- Mandatory justification
        justification           TEXT          NOT NULL,

        status                  tasks.deadline_extension_status
                                              NOT NULL DEFAULT 'pending',

        -- Who reviewed it
        reviewed_by_position_id VARCHAR       NULL,
        reviewed_by_id          VARCHAR       NULL,
        review_remarks          TEXT          NULL,
        reviewed_at             TIMESTAMPTZ   NULL,

        created_at              TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

        CONSTRAINT chk_task_extension_deadline
          CHECK (requested_deadline > current_deadline)
      );

      CREATE INDEX IF NOT EXISTS idx_task_deadline_ext_task_status
        ON tasks.deadline_extension_requests (task_id, status);

      COMMENT ON TABLE tasks.deadline_extension_requests IS
        'Formal deadline extension requests for tasks. §4.10 / §17.3 of Task-Management-Architecture.';
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS tasks.deadline_extension_requests;`);
    await queryRunner.query(`DROP TYPE IF EXISTS tasks.deadline_extension_status;`);
    await queryRunner.query(`
      ALTER TABLE tasks.tasks
        DROP COLUMN IF EXISTS source_assignment_id;
    `);
  }
}
