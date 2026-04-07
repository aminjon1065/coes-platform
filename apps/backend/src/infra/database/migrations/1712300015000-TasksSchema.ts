import { MigrationInterface, QueryRunner } from 'typeorm';

export class TasksSchema1712300015000 implements MigrationInterface {
  name = 'TasksSchema1712300015000';

  async up(queryRunner: QueryRunner): Promise<void> {
    // Schema
    await queryRunner.query(`CREATE SCHEMA IF NOT EXISTS tasks`);

    // Enums
    await queryRunner.query(`
      CREATE TYPE tasks.task_status AS ENUM (
        'draft', 'assigned', 'accepted', 'in_progress', 'on_hold',
        'completed', 'verified', 'returned',
        'cannot_execute', 'cancelled', 'closed'
      )
    `);
    await queryRunner.query(`
      CREATE TYPE tasks.task_priority AS ENUM (
        'low', 'normal', 'high', 'critical'
      )
    `);
    await queryRunner.query(`
      CREATE TYPE tasks.task_source AS ENUM (
        'manual', 'document_generated', 'system_generated'
      )
    `);
    await queryRunner.query(`
      CREATE TYPE tasks.assignment_type AS ENUM (
        'primary', 'co_executor', 'observer'
      )
    `);
    await queryRunner.query(`
      CREATE TYPE tasks.assignment_status AS ENUM (
        'active', 'completed', 'removed'
      )
    `);

    // ── task_types ─────────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE tasks.task_types (
        id                      UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
        name                    VARCHAR(100)  NOT NULL UNIQUE,
        name_ru                 VARCHAR(100)  NULL,
        name_tg                 VARCHAR(100)  NULL,
        description             TEXT          NULL,
        default_priority        INTEGER       NOT NULL DEFAULT 2,
        default_deadline_days   INTEGER       NULL,
        requires_acceptance     BOOLEAN       NOT NULL DEFAULT false,
        requires_verification   BOOLEAN       NOT NULL DEFAULT false,
        supports_co_executors   BOOLEAN       NOT NULL DEFAULT true,
        supports_subtasks       BOOLEAN       NOT NULL DEFAULT true,
        supports_draft          BOOLEAN       NOT NULL DEFAULT false,
        active                  BOOLEAN       NOT NULL DEFAULT true,
        created_at              TIMESTAMPTZ   NOT NULL DEFAULT now(),
        updated_at              TIMESTAMPTZ   NOT NULL DEFAULT now()
      )
    `);

    // ── tasks ──────────────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE tasks.tasks (
        id                      UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
        type_id                 UUID          NOT NULL REFERENCES tasks.task_types(id),
        title                   VARCHAR(500)  NOT NULL,
        description             TEXT          NULL,
        status                  tasks.task_status   NOT NULL DEFAULT 'assigned',
        priority                tasks.task_priority NOT NULL DEFAULT 'normal',
        source                  tasks.task_source   NOT NULL DEFAULT 'manual',
        classification          SMALLINT      NOT NULL DEFAULT 1,
        assigning_position_id   VARCHAR       NOT NULL,
        created_by_id           VARCHAR       NOT NULL,
        responsible_position_id VARCHAR       NOT NULL,
        parent_task_id          UUID          NULL REFERENCES tasks.tasks(id),
        depth                   INTEGER       NOT NULL DEFAULT 0,
        source_document_id      VARCHAR       NULL,
        source_resolution_id    VARCHAR       NULL,
        discussion_channel_id   VARCHAR       NULL,
        deadline                DATE          NULL,
        is_overdue              BOOLEAN       NOT NULL DEFAULT false,
        overdue_at              TIMESTAMPTZ   NULL,
        progress_percent        INTEGER       NOT NULL DEFAULT 0,
        progress_note           TEXT          NULL,
        completion_report       TEXT          NULL,
        completed_at            TIMESTAMPTZ   NULL,
        cancelled_at            TIMESTAMPTZ   NULL,
        cancel_reason           VARCHAR(500)  NULL,
        hold_reason             VARCHAR(500)  NULL,
        cannot_execute_reason   VARCHAR(500)  NULL,
        created_at              TIMESTAMPTZ   NOT NULL DEFAULT now(),
        updated_at              TIMESTAMPTZ   NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`
      CREATE INDEX idx_tasks_status_created
        ON tasks.tasks (status, created_at);
      CREATE INDEX idx_tasks_type_status
        ON tasks.tasks (type_id, status);
      CREATE INDEX idx_tasks_assigning_position_status
        ON tasks.tasks (assigning_position_id, status);
      CREATE INDEX idx_tasks_responsible_position
        ON tasks.tasks (responsible_position_id, status);
      CREATE INDEX idx_tasks_parent
        ON tasks.tasks (parent_task_id)
        WHERE parent_task_id IS NOT NULL;
      CREATE INDEX idx_tasks_deadline_active
        ON tasks.tasks (deadline, status)
        WHERE deadline IS NOT NULL
          AND status NOT IN ('completed','verified','cancelled','closed');
      CREATE INDEX idx_tasks_source_doc
        ON tasks.tasks (source_document_id)
        WHERE source_document_id IS NOT NULL;
    `);

    // ── task_assignments ──────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE tasks.task_assignments (
        id                      UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
        task_id                 UUID          NOT NULL REFERENCES tasks.tasks(id) ON DELETE CASCADE,
        position_id             VARCHAR       NOT NULL,
        assigned_user_id        VARCHAR       NULL,
        assignment_type         tasks.assignment_type   NOT NULL DEFAULT 'primary',
        status                  tasks.assignment_status NOT NULL DEFAULT 'active',
        assigned_by_position_id VARCHAR       NOT NULL,
        assigned_by_user_id     VARCHAR       NOT NULL,
        deadline                DATE          NULL,
        accepted_at             TIMESTAMPTZ   NULL,
        removed_at              TIMESTAMPTZ   NULL,
        remove_reason           VARCHAR(500)  NULL,
        created_at              TIMESTAMPTZ   NOT NULL DEFAULT now(),
        updated_at              TIMESTAMPTZ   NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`
      CREATE INDEX idx_task_assignments_position_status
        ON tasks.task_assignments (position_id, status);
      CREATE UNIQUE INDEX uq_task_assignments_active_position
        ON tasks.task_assignments (task_id, position_id)
        WHERE status = 'active';
    `);

    // ── task_history ──────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE tasks.task_history (
        id                UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
        task_id           UUID          NOT NULL REFERENCES tasks.tasks(id) ON DELETE CASCADE,
        event_type        VARCHAR(100)  NOT NULL,
        actor_id          VARCHAR       NOT NULL,
        actor_position_id VARCHAR       NULL,
        previous_value    JSONB         NULL,
        new_value         JSONB         NULL,
        remark            TEXT          NULL,
        created_at        TIMESTAMPTZ   NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`
      CREATE INDEX idx_task_history_task_created
        ON tasks.task_history (task_id, created_at);
    `);

    // ── task_comments ─────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE tasks.task_comments (
        id                UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
        task_id           UUID          NOT NULL REFERENCES tasks.tasks(id) ON DELETE CASCADE,
        author_id         VARCHAR       NOT NULL,
        author_position_id VARCHAR      NULL,
        body              TEXT          NOT NULL,
        is_internal       BOOLEAN       NOT NULL DEFAULT false,
        deleted_at        TIMESTAMPTZ   NULL,
        created_at        TIMESTAMPTZ   NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`
      CREATE INDEX idx_task_comments_task_created
        ON tasks.task_comments (task_id, created_at);
    `);

    // ── task_attachments ──────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE tasks.task_attachments (
        id                  UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
        task_id             UUID          NOT NULL REFERENCES tasks.tasks(id) ON DELETE CASCADE,
        file_id             VARCHAR       NOT NULL,
        file_name           VARCHAR(500)  NOT NULL,
        mime_type           VARCHAR(100)  NULL,
        file_size_bytes     BIGINT        NULL,
        uploader_id         VARCHAR       NOT NULL,
        uploader_position_id VARCHAR      NULL,
        classification      SMALLINT      NOT NULL DEFAULT 1,
        removed_at          TIMESTAMPTZ   NULL,
        created_at          TIMESTAMPTZ   NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`
      CREATE INDEX idx_task_attachments_task
        ON tasks.task_attachments (task_id);
    `);

    // ── Trigger: updated_at ───────────────────────────────────────────────
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION tasks.set_updated_at()
      RETURNS TRIGGER LANGUAGE plpgsql AS $$
      BEGIN NEW.updated_at = now(); RETURN NEW; END;
      $$
    `);
    for (const tbl of ['task_types', 'tasks', 'task_assignments']) {
      await queryRunner.query(`
        CREATE TRIGGER trg_${tbl}_updated_at
          BEFORE UPDATE ON tasks.${tbl}
          FOR EACH ROW EXECUTE FUNCTION tasks.set_updated_at()
      `);
    }
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP SCHEMA IF EXISTS tasks CASCADE`);
  }
}
