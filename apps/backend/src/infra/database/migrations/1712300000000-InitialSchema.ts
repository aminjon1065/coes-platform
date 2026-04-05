import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitialSchema1712300000000 implements MigrationInterface {
  name = 'InitialSchema1712300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ─────────────────────────────────────────────────────────────────────
    // IAM Schema
    // ─────────────────────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TYPE iam.credential_status AS ENUM (
        'active', 'locked', 'suspended', 'pending_reset'
      )
    `);

    await queryRunner.query(`
      CREATE TABLE iam.user_credentials (
        id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        username            VARCHAR(100) NOT NULL,
        email               VARCHAR(255) NOT NULL,
        password_hash       VARCHAR(255) NOT NULL,
        status              iam.credential_status NOT NULL DEFAULT 'active',
        failed_attempts     INT NOT NULL DEFAULT 0,
        locked_until        TIMESTAMPTZ,
        last_login_at       TIMESTAMPTZ,
        password_changed_at TIMESTAMPTZ,
        is_service_account  BOOLEAN NOT NULL DEFAULT FALSE,
        created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT uq_credentials_username UNIQUE (username),
        CONSTRAINT uq_credentials_email    UNIQUE (email)
      )
    `);

    await queryRunner.query(`
      CREATE TABLE iam.refresh_tokens (
        id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id     UUID NOT NULL REFERENCES iam.user_credentials(id) ON DELETE CASCADE,
        token_hash  VARCHAR(255) NOT NULL,
        family      UUID NOT NULL,
        expires_at  TIMESTAMPTZ NOT NULL,
        revoked_at  TIMESTAMPTZ,
        ip_address  VARCHAR(45),
        user_agent  VARCHAR(512),
        created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT uq_refresh_token_hash UNIQUE (token_hash)
      )
    `);

    await queryRunner.query(`CREATE INDEX idx_refresh_tokens_user_family ON iam.refresh_tokens (user_id, family)`);

    // ─────────────────────────────────────────────────────────────────────
    // ORG Schema
    // ─────────────────────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE org.departments (
        id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name        VARCHAR(255) NOT NULL,
        name_ru     VARCHAR(255),
        name_tg     VARCHAR(255),
        short_code  VARCHAR(20),
        parent_id   UUID REFERENCES org.departments(id) ON DELETE RESTRICT,
        active      BOOLEAN NOT NULL DEFAULT TRUE,
        sort_order  INT NOT NULL DEFAULT 0,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await queryRunner.query(`
      CREATE TABLE org.department_closure (
        ancestor_id   UUID NOT NULL REFERENCES org.departments(id) ON DELETE CASCADE,
        descendant_id UUID NOT NULL REFERENCES org.departments(id) ON DELETE CASCADE,
        depth         INT NOT NULL DEFAULT 0,
        PRIMARY KEY (ancestor_id, descendant_id)
      )
    `);

    await queryRunner.query(`
      CREATE TYPE org.position_level AS ENUM (
        'chairman', 'deputy_chairman', 'department_head', 'deputy_head',
        'division_head', 'senior_specialist', 'specialist', 'analyst',
        'operator', 'clerk'
      )
    `);

    await queryRunner.query(`
      CREATE TABLE org.positions (
        id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        title                 VARCHAR(255) NOT NULL,
        title_ru              VARCHAR(255),
        title_tg              VARCHAR(255),
        level                 org.position_level NOT NULL DEFAULT 'specialist',
        department_id         UUID NOT NULL REFERENCES org.departments(id) ON DELETE RESTRICT,
        reports_to_id         UUID REFERENCES org.positions(id) ON DELETE SET NULL,
        can_assign_tasks      BOOLEAN NOT NULL DEFAULT FALSE,
        can_approve_documents BOOLEAN NOT NULL DEFAULT FALSE,
        can_issue_resolutions BOOLEAN NOT NULL DEFAULT FALSE,
        active                BOOLEAN NOT NULL DEFAULT TRUE,
        created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await queryRunner.query(`CREATE INDEX idx_positions_dept_level ON org.positions (department_id, level)`);

    await queryRunner.query(`
      CREATE TYPE org.org_change_type AS ENUM (
        'department_created', 'department_updated', 'department_deactivated',
        'position_created', 'position_updated', 'position_deactivated',
        'reporting_line_changed'
      )
    `);

    await queryRunner.query(`
      CREATE TABLE org.org_change_history (
        id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        change_type org.org_change_type NOT NULL,
        entity_type VARCHAR(50) NOT NULL,
        entity_id   UUID NOT NULL,
        changed_by_id UUID,
        before      JSONB,
        after       JSONB,
        occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    // ─────────────────────────────────────────────────────────────────────
    // AUTHZ Schema
    // ─────────────────────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE authz.permissions (
        id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name        VARCHAR(150) NOT NULL,
        domain      VARCHAR(50) NOT NULL,
        resource    VARCHAR(50) NOT NULL,
        action      VARCHAR(50) NOT NULL,
        description VARCHAR(500),
        created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT uq_permission_name UNIQUE (name)
      )
    `);

    await queryRunner.query(`
      CREATE TABLE authz.roles (
        id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name            VARCHAR(100) NOT NULL,
        description     VARCHAR(500),
        parent_role_id  UUID REFERENCES authz.roles(id) ON DELETE SET NULL,
        is_system_role  BOOLEAN NOT NULL DEFAULT FALSE,
        created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT uq_role_name UNIQUE (name)
      )
    `);

    await queryRunner.query(`
      CREATE TABLE authz.role_permissions (
        role_id       UUID NOT NULL REFERENCES authz.roles(id) ON DELETE CASCADE,
        permission_id UUID NOT NULL REFERENCES authz.permissions(id) ON DELETE CASCADE,
        PRIMARY KEY (role_id, permission_id)
      )
    `);

    await queryRunner.query(`
      CREATE TABLE authz.user_role_assignments (
        id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id              UUID NOT NULL,
        role_id              UUID NOT NULL REFERENCES authz.roles(id) ON DELETE CASCADE,
        department_scope_id  UUID,
        position_id          UUID,
        granted_by_id        UUID,
        expires_at           TIMESTAMPTZ,
        revoked_at           TIMESTAMPTZ,
        created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await queryRunner.query(`CREATE INDEX idx_user_role_assignments ON authz.user_role_assignments (user_id, role_id)`);

    await queryRunner.query(`
      CREATE TABLE authz.delegations (
        id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        delegator_id  UUID NOT NULL,
        delegate_id   UUID NOT NULL,
        position_id   UUID NOT NULL,
        start_at      TIMESTAMPTZ NOT NULL,
        end_at        TIMESTAMPTZ NOT NULL,
        reason        VARCHAR(500),
        created_by_id UUID,
        revoked_at    TIMESTAMPTZ,
        created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await queryRunner.query(`CREATE INDEX idx_delegations_delegate ON authz.delegations (delegate_id, start_at, end_at)`);

    // ─────────────────────────────────────────────────────────────────────
    // AUDIT Schema
    // ─────────────────────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TYPE audit.audit_severity AS ENUM ('info', 'warning', 'critical')
    `);

    await queryRunner.query(`
      CREATE TABLE audit.audit_events (
        id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        actor_id        UUID,
        actor_username  VARCHAR(100),
        event_type      VARCHAR(100) NOT NULL,
        resource_type   VARCHAR(100),
        resource_id     UUID,
        ip_address      VARCHAR(45),
        user_agent      VARCHAR(512),
        success         BOOLEAN NOT NULL DEFAULT TRUE,
        failure_reason  VARCHAR(500),
        severity        audit.audit_severity NOT NULL DEFAULT 'info',
        metadata        JSONB,
        integrity_hash  VARCHAR(64),
        occurred_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    // Audit table: no UPDATE/DELETE — enforced by DB grants (see 01-schemas.sql)
    await queryRunner.query(`CREATE INDEX idx_audit_actor_time   ON audit.audit_events (actor_id, occurred_at)`);
    await queryRunner.query(`CREATE INDEX idx_audit_type_time    ON audit.audit_events (event_type, occurred_at)`);
    await queryRunner.query(`CREATE INDEX idx_audit_resource     ON audit.audit_events (resource_type, resource_id)`);

    // ─────────────────────────────────────────────────────────────────────
    // Seed: system roles and core permissions
    // ─────────────────────────────────────────────────────────────────────
    await queryRunner.query(`
      INSERT INTO authz.roles (id, name, description, is_system_role) VALUES
        (gen_random_uuid(), 'super_admin',      'Full platform administration', TRUE),
        (gen_random_uuid(), 'platform_admin',   'User and org management',      TRUE),
        (gen_random_uuid(), 'security_auditor', 'Read-only audit log access',   TRUE),
        (gen_random_uuid(), 'department_head',  'Manage own department',         FALSE),
        (gen_random_uuid(), 'analyst',          'Data entry and reporting',      FALSE),
        (gen_random_uuid(), 'clerk',            'Document registration',         FALSE)
    `);

    await queryRunner.query(`
      INSERT INTO authz.permissions (name, domain, resource, action, description) VALUES
        ('iam.user.create',             'iam',   'user',       'create',   'Create user credentials'),
        ('iam.user.read',               'iam',   'user',       'read',     'Read user credentials'),
        ('iam.user.update',             'iam',   'user',       'update',   'Update user credentials'),
        ('iam.user.delete',             'iam',   'user',       'delete',   'Delete/deactivate user'),
        ('org.department.create',       'org',   'department', 'create',   'Create departments'),
        ('org.department.update',       'org',   'department', 'update',   'Update departments'),
        ('org.position.create',         'org',   'position',   'create',   'Create positions'),
        ('org.position.update',         'org',   'position',   'update',   'Update positions'),
        ('authz.role.assign',           'authz', 'role',       'assign',   'Assign roles to users'),
        ('audit.event.read',            'audit', 'event',      'read',     'Read audit log'),
        ('edms.document.create',        'edms',  'document',   'create',   'Create documents'),
        ('edms.document.read',          'edms',  'document',   'read',     'Read documents'),
        ('edms.document.approve',       'edms',  'document',   'approve',  'Approve documents'),
        ('edms.document.issue_resolution', 'edms', 'document', 'issue_resolution', 'Issue resolutions'),
        ('tasks.task.create',           'tasks', 'task',       'create',   'Create tasks'),
        ('tasks.task.assign',           'tasks', 'task',       'assign',   'Assign tasks to subordinates'),
        ('tasks.task.read',             'tasks', 'task',       'read',     'Read tasks'),
        ('tasks.task.update',           'tasks', 'task',       'update',   'Update task status')
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop in reverse dependency order
    await queryRunner.query(`DROP TABLE IF EXISTS audit.audit_events`);
    await queryRunner.query(`DROP TYPE  IF EXISTS audit.audit_severity`);

    await queryRunner.query(`DROP TABLE IF EXISTS authz.delegations`);
    await queryRunner.query(`DROP TABLE IF EXISTS authz.user_role_assignments`);
    await queryRunner.query(`DROP TABLE IF EXISTS authz.role_permissions`);
    await queryRunner.query(`DROP TABLE IF EXISTS authz.roles`);
    await queryRunner.query(`DROP TABLE IF EXISTS authz.permissions`);

    await queryRunner.query(`DROP TABLE IF EXISTS org.org_change_history`);
    await queryRunner.query(`DROP TYPE  IF EXISTS org.org_change_type`);
    await queryRunner.query(`DROP TABLE IF EXISTS org.positions`);
    await queryRunner.query(`DROP TYPE  IF EXISTS org.position_level`);
    await queryRunner.query(`DROP TABLE IF EXISTS org.department_closure`);
    await queryRunner.query(`DROP TABLE IF EXISTS org.departments`);

    await queryRunner.query(`DROP TABLE IF EXISTS iam.refresh_tokens`);
    await queryRunner.query(`DROP TABLE IF EXISTS iam.user_credentials`);
    await queryRunner.query(`DROP TYPE  IF EXISTS iam.credential_status`);
  }
}
