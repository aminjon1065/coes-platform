import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Phase 6.1 — SSO Schema
 *
 * Adds SSO provider columns to iam.user_credentials so a credential
 * can be backed by either a local password or an external identity provider
 * (LDAP/AD or SAML 2.0). Both can coexist (local login remains available
 * as a fallback for service accounts and emergency access).
 *
 * New table: iam.sso_configurations — per-deployment IdP config stored in DB
 * so ops can update LDAP/SAML settings without a backend redeploy.
 */
export class SsoSchema1712300010000 implements MigrationInterface {
  name = 'SsoSchema1712300010000';

  async up(queryRunner: QueryRunner): Promise<void> {
    // ── Extend user_credentials ──────────────────────────────────────────────

    await queryRunner.query(`
      ALTER TABLE iam.user_credentials
        ADD COLUMN IF NOT EXISTS sso_provider   VARCHAR(50)  NULL,
        ADD COLUMN IF NOT EXISTS sso_subject_id VARCHAR(500) NULL,
        ADD COLUMN IF NOT EXISTS sso_attributes JSONB        NULL,
        ADD COLUMN IF NOT EXISTS sso_linked_at  TIMESTAMPTZ  NULL;

      -- Unique: one local account per (provider, external ID)
      CREATE UNIQUE INDEX IF NOT EXISTS uq_cred_sso
        ON iam.user_credentials (sso_provider, sso_subject_id)
        WHERE sso_provider IS NOT NULL AND sso_subject_id IS NOT NULL;

      COMMENT ON COLUMN iam.user_credentials.sso_provider
        IS 'Identity provider type: ''ldap'' | ''saml'' | NULL (local)';
      COMMENT ON COLUMN iam.user_credentials.sso_subject_id
        IS 'Stable external identifier: sAMAccountName (LDAP) or NameID (SAML)';
      COMMENT ON COLUMN iam.user_credentials.sso_attributes
        IS 'Raw provider attributes cached at last login (groups, displayName, etc.)';
    `);

    // ── SSO configurations table ─────────────────────────────────────────────

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS iam.sso_configurations (
        id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
        provider    VARCHAR(50)  NOT NULL,        -- 'ldap' | 'saml'
        name        VARCHAR(100) NOT NULL,        -- human label, e.g. "CoESCD AD"
        enabled     BOOLEAN      NOT NULL DEFAULT TRUE,
        config      JSONB        NOT NULL DEFAULT '{}',
        created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        CONSTRAINT uq_sso_provider_name UNIQUE (provider, name)
      );

      COMMENT ON TABLE iam.sso_configurations
        IS 'Runtime-configurable SSO provider settings (LDAP bind params, SAML metadata)';
      COMMENT ON COLUMN iam.sso_configurations.config
        IS 'Provider-specific: LDAP {url,baseDn,bindDn,…} | SAML {entryPoint,issuer,cert,…}';
    `);

    await queryRunner.query(`
      GRANT SELECT, INSERT, UPDATE ON iam.sso_configurations TO coescd;
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS iam.uq_cred_sso;`);
    await queryRunner.query(`
      ALTER TABLE iam.user_credentials
        DROP COLUMN IF EXISTS sso_provider,
        DROP COLUMN IF EXISTS sso_subject_id,
        DROP COLUMN IF EXISTS sso_attributes,
        DROP COLUMN IF EXISTS sso_linked_at;
    `);
    await queryRunner.query(`DROP TABLE IF EXISTS iam.sso_configurations;`);
  }
}
