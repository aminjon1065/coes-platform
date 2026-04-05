import { MigrationInterface, QueryRunner } from 'typeorm';

export class UsersSchema1712300001000 implements MigrationInterface {
  name = 'UsersSchema1712300001000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE users.user_status AS ENUM (
        'active', 'on_leave', 'suspended', 'offboarded'
      )
    `);

    await queryRunner.query(`
      CREATE TABLE users.user_profiles (
        id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        credential_id    UUID NOT NULL,
        first_name       VARCHAR(100) NOT NULL,
        last_name        VARCHAR(100) NOT NULL,
        middle_name      VARCHAR(100),
        display_name     VARCHAR(255),
        email            VARCHAR(255) NOT NULL,
        phone            VARCHAR(30),
        avatar_url       VARCHAR(512),
        status           users.user_status NOT NULL DEFAULT 'active',
        clearance_level  INT NOT NULL DEFAULT 0,
        created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT uq_user_profiles_credential UNIQUE (credential_id),
        CONSTRAINT uq_user_profiles_email      UNIQUE (email),
        CONSTRAINT chk_clearance_level CHECK (clearance_level BETWEEN 0 AND 3)
      )
    `);

    await queryRunner.query(`
      CREATE TYPE users.assignment_type AS ENUM ('primary', 'acting', 'concurrent')
    `);

    await queryRunner.query(`
      CREATE TABLE users.user_position_assignments (
        id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id       UUID NOT NULL REFERENCES users.user_profiles(id) ON DELETE CASCADE,
        position_id   UUID NOT NULL,
        type          users.assignment_type NOT NULL DEFAULT 'primary',
        assigned_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        vacated_at    TIMESTAMPTZ,
        assigned_by_id UUID,
        vacated_by_id  UUID,
        notes         VARCHAR(500),
        created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await queryRunner.query(`
      CREATE INDEX idx_user_position_assignments_user
        ON users.user_position_assignments (user_id, vacated_at)
    `);

    await queryRunner.query(`
      CREATE INDEX idx_user_position_assignments_position
        ON users.user_position_assignments (position_id, vacated_at)
    `);

    /* Enforce: only one active PRIMARY assignment per user at a time */
    await queryRunner.query(`
      CREATE UNIQUE INDEX uq_one_active_primary_per_user
        ON users.user_position_assignments (user_id, type)
        WHERE vacated_at IS NULL AND type = 'primary'
    `);

    await queryRunner.query(`
      CREATE TYPE users.app_language AS ENUM ('ru', 'tg', 'en')
    `);

    await queryRunner.query(`
      CREATE TABLE users.user_preferences (
        id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id            UUID NOT NULL REFERENCES users.user_profiles(id) ON DELETE CASCADE,
        language           users.app_language NOT NULL DEFAULT 'ru',
        notify_email       BOOLEAN NOT NULL DEFAULT TRUE,
        notify_sms         BOOLEAN NOT NULL DEFAULT FALSE,
        notify_in_app      BOOLEAN NOT NULL DEFAULT TRUE,
        quiet_hours_start  VARCHAR(5),
        quiet_hours_end    VARCHAR(5),
        updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT uq_user_preferences_user UNIQUE (user_id)
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS users.user_preferences`);
    await queryRunner.query(`DROP TYPE  IF EXISTS users.app_language`);
    await queryRunner.query(`DROP TABLE IF EXISTS users.user_position_assignments`);
    await queryRunner.query(`DROP TYPE  IF EXISTS users.assignment_type`);
    await queryRunner.query(`DROP TABLE IF EXISTS users.user_profiles`);
    await queryRunner.query(`DROP TYPE  IF EXISTS users.user_status`);
  }
}
