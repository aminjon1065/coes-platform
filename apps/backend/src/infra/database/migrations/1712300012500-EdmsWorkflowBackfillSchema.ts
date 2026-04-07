import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Backfills the EDMS workflow and resolution tables that are represented by
 * entities in the codebase but were never added to the migration chain.
 *
 * This migration is intentionally idempotent so it can repair partially
 * provisioned environments without requiring a clean database.
 */
export class EdmsWorkflowBackfillSchema1712300012500 implements MigrationInterface {
  name = 'EdmsWorkflowBackfillSchema1712300012500';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE SCHEMA IF NOT EXISTS edms`);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM pg_type t
          JOIN pg_namespace n ON n.oid = t.typnamespace
          WHERE n.nspname = 'edms' AND t.typname = 'workflow_step_type'
        ) THEN
          CREATE TYPE edms.workflow_step_type AS ENUM (
            'review',
            'endorsement',
            'approval',
            'signing',
            'resolution',
            'distribution',
            'execution',
            'acknowledgement'
          );
        END IF;
      END
      $$;
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM pg_type t
          JOIN pg_namespace n ON n.oid = t.typnamespace
          WHERE n.nspname = 'edms' AND t.typname = 'workflow_instance_status'
        ) THEN
          CREATE TYPE edms.workflow_instance_status AS ENUM (
            'active',
            'suspended',
            'completed',
            'rejected',
            'cancelled'
          );
        END IF;
      END
      $$;
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM pg_type t
          JOIN pg_namespace n ON n.oid = t.typnamespace
          WHERE n.nspname = 'edms' AND t.typname = 'workflow_step_status'
        ) THEN
          CREATE TYPE edms.workflow_step_status AS ENUM (
            'pending',
            'active',
            'overdue',
            'completed',
            'returned',
            'skipped'
          );
        END IF;
      END
      $$;
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM pg_type t
          JOIN pg_namespace n ON n.oid = t.typnamespace
          WHERE n.nspname = 'edms' AND t.typname = 'workflow_step_action'
        ) THEN
          CREATE TYPE edms.workflow_step_action AS ENUM (
            'reviewed',
            'endorsed',
            'endorsed_conditionally',
            'approved',
            'rejected',
            'signed',
            'resolution_issued',
            'distributed',
            'acknowledged',
            'returned',
            'escalated'
          );
        END IF;
      END
      $$;
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM pg_type t
          JOIN pg_namespace n ON n.oid = t.typnamespace
          WHERE n.nspname = 'edms' AND t.typname = 'resolution_priority'
        ) THEN
          CREATE TYPE edms.resolution_priority AS ENUM (
            'routine',
            'urgent',
            'emergency'
          );
        END IF;
      END
      $$;
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM pg_type t
          JOIN pg_namespace n ON n.oid = t.typnamespace
          WHERE n.nspname = 'edms' AND t.typname = 'executor_assignment_status'
        ) THEN
          CREATE TYPE edms.executor_assignment_status AS ENUM (
            'assigned',
            'accepted',
            'in_progress',
            'completed',
            'overdue',
            'returned',
            'cancelled'
          );
        END IF;
      END
      $$;
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM pg_type t
          JOIN pg_namespace n ON n.oid = t.typnamespace
          WHERE n.nspname = 'edms' AND t.typname = 'executor_role'
        ) THEN
          CREATE TYPE edms.executor_role AS ENUM (
            'primary',
            'co_executor'
          );
        END IF;
      END
      $$;
    `);

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
    `);

    await queryRunner.query(`
      ALTER TABLE edms.workflow_templates
        ADD COLUMN IF NOT EXISTS owner_department_id UUID NULL
          REFERENCES org.departments(id) ON DELETE SET NULL;
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_workflow_templates_document_type
        ON edms.workflow_templates (document_type_id);
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_wt_owner_dept
        ON edms.workflow_templates (owner_department_id)
        WHERE owner_department_id IS NOT NULL;
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS edms.workflow_step_definitions (
        id                         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        template_id                UUID NOT NULL REFERENCES edms.workflow_templates(id) ON DELETE CASCADE,
        step_order                 INTEGER NOT NULL,
        step_name                  VARCHAR(200) NOT NULL,
        step_type                  edms.workflow_step_type NOT NULL,
        target_resolver            JSONB NOT NULL,
        is_parallel                BOOLEAN NOT NULL DEFAULT FALSE,
        parallel_threshold         INTEGER NULL,
        timeout_hours              INTEGER NULL,
        secondary_escalation_hours INTEGER NULL,
        return_to_step             INTEGER NULL,
        condition                  JSONB NULL,
        is_optional                BOOLEAN NOT NULL DEFAULT FALSE
      );
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_workflow_step_defs_template_order
        ON edms.workflow_step_definitions (template_id, step_order);
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS edms.workflow_instances (
        id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        document_id              UUID NOT NULL REFERENCES edms.documents(id) ON DELETE CASCADE,
        template_id              UUID NOT NULL REFERENCES edms.workflow_templates(id) ON DELETE RESTRICT,
        template_version         INTEGER NOT NULL,
        status                   edms.workflow_instance_status NOT NULL DEFAULT 'active',
        current_step_order       INTEGER NULL,
        initiated_by_id          UUID NOT NULL,
        initiated_by_position_id VARCHAR(255) NULL,
        deadline                 TIMESTAMPTZ NULL,
        completed_at             TIMESTAMPTZ NULL,
        rejected_at              TIMESTAMPTZ NULL,
        rejection_reason         TEXT NULL,
        created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_workflow_instances_document_status
        ON edms.workflow_instances (document_id, status);
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_workflow_instances_active_document
        ON edms.workflow_instances (document_id)
        WHERE status = 'active';
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS edms.workflow_steps (
        id                         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        instance_id                UUID NOT NULL REFERENCES edms.workflow_instances(id) ON DELETE CASCADE,
        step_order                 INTEGER NOT NULL,
        step_name                  VARCHAR(200) NOT NULL,
        step_type                  edms.workflow_step_type NOT NULL,
        status                     edms.workflow_step_status NOT NULL DEFAULT 'pending',
        position_id                UUID NOT NULL,
        assigned_user_id           VARCHAR(255) NULL,
        is_parallel                BOOLEAN NOT NULL DEFAULT FALSE,
        activated_at               TIMESTAMPTZ NULL,
        deadline                   TIMESTAMPTZ NULL,
        overdue_at                 TIMESTAMPTZ NULL,
        secondary_escalation_fired BOOLEAN NOT NULL DEFAULT FALSE,
        action_taken               edms.workflow_step_action NULL,
        actor_id                   VARCHAR(255) NULL,
        actor_position_id          VARCHAR(255) NULL,
        delegation_id              VARCHAR(255) NULL,
        remarks                    TEXT NULL,
        completed_at               TIMESTAMPTZ NULL,
        created_at                 TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at                 TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_workflow_steps_instance_order
        ON edms.workflow_steps (instance_id, step_order);
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_workflow_steps_position_status
        ON edms.workflow_steps (position_id, status);
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS edms.workflow_history (
        id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        document_id       UUID NOT NULL,
        instance_id       VARCHAR(255) NULL,
        step_id           VARCHAR(255) NULL,
        event_type        VARCHAR(100) NOT NULL,
        actor_id          VARCHAR(255) NULL,
        actor_position_id VARCHAR(255) NULL,
        delegation_id     VARCHAR(255) NULL,
        payload           JSONB NULL,
        remarks           TEXT NULL,
        created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_workflow_history_document_created
        ON edms.workflow_history (document_id, created_at);
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_workflow_history_instance
        ON edms.workflow_history (instance_id);
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS edms.resolutions (
        id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        document_id         UUID NOT NULL REFERENCES edms.documents(id) ON DELETE CASCADE,
        workflow_step_id    UUID NULL REFERENCES edms.workflow_steps(id) ON DELETE SET NULL,
        issuing_position_id UUID NOT NULL,
        issuing_user_id     UUID NOT NULL,
        text                TEXT NOT NULL,
        priority            edms.resolution_priority NOT NULL DEFAULT 'routine',
        deadline            DATE NULL,
        created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_resolutions_document_id
        ON edms.resolutions (document_id);
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_resolutions_issuing_position_id
        ON edms.resolutions (issuing_position_id);
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS edms.executor_assignments (
        id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        resolution_id     UUID NOT NULL REFERENCES edms.resolutions(id) ON DELETE CASCADE,
        document_id       UUID NOT NULL REFERENCES edms.documents(id) ON DELETE CASCADE,
        position_id       UUID NOT NULL,
        assigned_user_id  VARCHAR(255) NULL,
        executor_role     edms.executor_role NOT NULL DEFAULT 'primary',
        instruction       TEXT NULL,
        status            edms.executor_assignment_status NOT NULL DEFAULT 'assigned',
        deadline          DATE NULL,
        linked_task_id    VARCHAR(255) NULL,
        completion_report TEXT NULL,
        completed_at      TIMESTAMPTZ NULL,
        created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_executor_assignments_resolution_position
        ON edms.executor_assignments (resolution_id, position_id);
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_executor_assignments_document_status
        ON edms.executor_assignments (document_id, status);
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS edms.executor_assignments`);
    await queryRunner.query(`DROP TABLE IF EXISTS edms.resolutions`);
    await queryRunner.query(`DROP TABLE IF EXISTS edms.workflow_history`);
    await queryRunner.query(`DROP TABLE IF EXISTS edms.workflow_steps`);
    await queryRunner.query(`DROP TABLE IF EXISTS edms.workflow_instances`);
    await queryRunner.query(`DROP TABLE IF EXISTS edms.workflow_step_definitions`);
    await queryRunner.query(`DROP TABLE IF EXISTS edms.workflow_templates`);

    await queryRunner.query(`DROP TYPE IF EXISTS edms.executor_role`);
    await queryRunner.query(`DROP TYPE IF EXISTS edms.executor_assignment_status`);
    await queryRunner.query(`DROP TYPE IF EXISTS edms.resolution_priority`);
    await queryRunner.query(`DROP TYPE IF EXISTS edms.workflow_step_action`);
    await queryRunner.query(`DROP TYPE IF EXISTS edms.workflow_step_status`);
    await queryRunner.query(`DROP TYPE IF EXISTS edms.workflow_instance_status`);
    await queryRunner.query(`DROP TYPE IF EXISTS edms.workflow_step_type`);
  }
}
