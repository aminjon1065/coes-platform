import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * RBAC & Organisation Model Hardening — Section 2.RBAC-and-Organization-Model.md
 *
 * 1. authz.position_roles   — links org positions to roles (positional roles, §6.1)
 * 2. authz.sod_rules        — separation-of-duties rule pairs (§9)
 * 3. Enhance authz.delegations — add authority_type, scope, justification,
 *                                authorized_by_id, revoked_by_id, revocation_reason,
 *                                status enum (§8.4 / §8.6)
 */
export class RbacOrgModelHardening1712300021000 implements MigrationInterface {
  name = 'RbacOrgModelHardening1712300021000';

  async up(queryRunner: QueryRunner): Promise<void> {
    // ── 1. position_roles ────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS authz.position_roles (
        id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
        position_id  UUID        NOT NULL,
        role_id      UUID        NOT NULL REFERENCES authz.roles(id) ON DELETE CASCADE,
        granted_by_id UUID       NULL,
        created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),

        CONSTRAINT uq_position_role UNIQUE (position_id, role_id)
      );

      CREATE INDEX IF NOT EXISTS idx_position_roles_position
        ON authz.position_roles (position_id);

      CREATE INDEX IF NOT EXISTS idx_position_roles_role
        ON authz.position_roles (role_id);

      COMMENT ON TABLE authz.position_roles IS
        'Positional roles: roles automatically active for any user occupying this org position. §6.1';
    `);

    // ── 2. sod_rules ─────────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS authz.sod_rules (
        id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
        role_a_id     UUID        NOT NULL REFERENCES authz.roles(id) ON DELETE CASCADE,
        role_b_id     UUID        NOT NULL REFERENCES authz.roles(id) ON DELETE CASCADE,
        description   VARCHAR(500) NOT NULL,
        created_by_id UUID        NULL,
        active        BOOLEAN     NOT NULL DEFAULT TRUE,
        created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),

        CONSTRAINT uq_sod_pair UNIQUE (role_a_id, role_b_id),
        CONSTRAINT chk_sod_distinct CHECK (role_a_id <> role_b_id)
      );

      CREATE INDEX IF NOT EXISTS idx_sod_rules_role_a
        ON authz.sod_rules (role_a_id) WHERE active;

      CREATE INDEX IF NOT EXISTS idx_sod_rules_role_b
        ON authz.sod_rules (role_b_id) WHERE active;

      COMMENT ON TABLE authz.sod_rules IS
        'Separation-of-duties: pairs of roles that must not be held simultaneously. §9';
    `);

    // ── 3. Enhance delegations ────────────────────────────────────────────────

    // New enums
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_type WHERE typname = 'delegation_authority_type'
        ) THEN
          CREATE TYPE authz.delegation_authority_type AS ENUM (
            'task_assignment',
            'document_approval',
            'document_routing',
            'acting_assignment',
            'module_access'
          );
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_type WHERE typname = 'delegation_status'
        ) THEN
          CREATE TYPE authz.delegation_status AS ENUM (
            'active',
            'expired',
            'revoked'
          );
        END IF;
      END $$;
    `);

    // Add new columns (all nullable/default-safe for existing rows)
    await queryRunner.query(`
      ALTER TABLE authz.delegations
        ADD COLUMN IF NOT EXISTS authority_type  authz.delegation_authority_type
                                                   NOT NULL DEFAULT 'task_assignment',
        ADD COLUMN IF NOT EXISTS scope           JSONB       NOT NULL DEFAULT '{}',
        ADD COLUMN IF NOT EXISTS justification   VARCHAR(1000) NOT NULL DEFAULT '',
        ADD COLUMN IF NOT EXISTS authorized_by_id UUID       NULL,
        ADD COLUMN IF NOT EXISTS revoked_by_id   UUID       NULL,
        ADD COLUMN IF NOT EXISTS revocation_reason VARCHAR(500) NULL,
        ADD COLUMN IF NOT EXISTS status          authz.delegation_status
                                                   NOT NULL DEFAULT 'active';
    `);

    // Back-fill status from existing revoked_at
    await queryRunner.query(`
      UPDATE authz.delegations
         SET status = 'revoked'
       WHERE revoked_at IS NOT NULL AND status = 'active';

      UPDATE authz.delegations
         SET status = 'expired'
       WHERE end_at < NOW() AND revoked_at IS NULL AND status = 'active';
    `);

    // Index for active-delegation lookups by delegate
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_delegations_delegate_status
        ON authz.delegations (delegate_id, status);

      CREATE INDEX IF NOT EXISTS idx_delegations_expiry_monitoring
        ON authz.delegations (end_at, status)
        WHERE status = 'active';
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE authz.delegations
        DROP COLUMN IF EXISTS authority_type,
        DROP COLUMN IF EXISTS scope,
        DROP COLUMN IF EXISTS justification,
        DROP COLUMN IF EXISTS authorized_by_id,
        DROP COLUMN IF EXISTS revoked_by_id,
        DROP COLUMN IF EXISTS revocation_reason,
        DROP COLUMN IF EXISTS status;
    `);

    await queryRunner.query(`DROP TYPE IF EXISTS authz.delegation_authority_type;`);
    await queryRunner.query(`DROP TYPE IF EXISTS authz.delegation_status;`);
    await queryRunner.query(`DROP TABLE IF EXISTS authz.sod_rules;`);
    await queryRunner.query(`DROP TABLE IF EXISTS authz.position_roles;`);
  }
}
