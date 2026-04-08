import { MigrationInterface, QueryRunner } from 'typeorm';

export class MfaSchema1712300020000 implements MigrationInterface {
  name = 'MfaSchema1712300020000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE iam.mfa_credentials (
        id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id      UUID        NOT NULL
                                 REFERENCES iam.user_credentials(id)
                                 ON DELETE CASCADE,
        secret       TEXT        NOT NULL,
        enabled      BOOLEAN     NOT NULL DEFAULT FALSE,
        verified_at  TIMESTAMPTZ,
        backup_codes JSONB       NOT NULL DEFAULT '[]'::jsonb,
        created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT uq_mfa_credentials_user_id UNIQUE (user_id)
      )
    `);

    await queryRunner.query(`
      CREATE INDEX idx_mfa_credentials_user_id ON iam.mfa_credentials(user_id)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS iam.idx_mfa_credentials_user_id`);
    await queryRunner.query(`DROP TABLE  IF EXISTS iam.mfa_credentials`);
  }
}
