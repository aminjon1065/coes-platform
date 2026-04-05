import { MigrationInterface, QueryRunner } from 'typeorm';

export class CallsSchema1712300005000 implements MigrationInterface {
  name = 'CallsSchema1712300005000';

  async up(queryRunner: QueryRunner): Promise<void> {
    // Schema
    await queryRunner.query(`CREATE SCHEMA IF NOT EXISTS calls`);

    // Enums
    await queryRunner.query(`
      CREATE TYPE calls.call_status AS ENUM (
        'scheduled', 'active', 'ended', 'cancelled'
      )
    `);
    await queryRunner.query(`
      CREATE TYPE calls.participant_status AS ENUM (
        'invited', 'joined', 'left', 'rejected'
      )
    `);
    await queryRunner.query(`
      CREATE TYPE calls.recording_status AS ENUM (
        'recording', 'stopped', 'processing', 'ready', 'failed', 'deleted'
      )
    `);

    // ── call_sessions ──────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE calls.call_sessions (
        id                UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
        channel_id        UUID          NOT NULL,
        initiated_by_id   UUID          NOT NULL,
        status            calls.call_status NOT NULL DEFAULT 'active',
        classification    SMALLINT      NOT NULL DEFAULT 0
                          CHECK (classification BETWEEN 0 AND 3),
        scheduled_start   TIMESTAMPTZ   NULL,
        actual_start      TIMESTAMPTZ   NOT NULL DEFAULT now(),
        ended_at          TIMESTAMPTZ   NULL,
        title             VARCHAR(200)  NULL,
        max_participants  SMALLINT      NOT NULL DEFAULT 50,
        created_at        TIMESTAMPTZ   NOT NULL DEFAULT now(),
        updated_at        TIMESTAMPTZ   NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`
      CREATE INDEX idx_call_sessions_channel ON calls.call_sessions (channel_id);
      CREATE INDEX idx_call_sessions_status  ON calls.call_sessions (status)
        WHERE status IN ('scheduled', 'active');
    `);

    // ── call_participants ──────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE calls.call_participants (
        id              UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
        session_id      UUID            NOT NULL REFERENCES calls.call_sessions(id) ON DELETE CASCADE,
        user_id         UUID            NOT NULL,
        position_id     UUID            NULL,
        display_name    VARCHAR(120)    NOT NULL,
        status          calls.participant_status NOT NULL DEFAULT 'invited',
        joined_at       TIMESTAMPTZ     NULL,
        left_at         TIMESTAMPTZ     NULL,
        audio_muted     BOOLEAN         NOT NULL DEFAULT false,
        video_muted     BOOLEAN         NOT NULL DEFAULT false,
        is_moderator    BOOLEAN         NOT NULL DEFAULT false,
        created_at      TIMESTAMPTZ     NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`
      CREATE INDEX idx_call_participants_session ON calls.call_participants (session_id);
      CREATE INDEX idx_call_participants_user    ON calls.call_participants (user_id);
      CREATE UNIQUE INDEX uq_call_participant
        ON calls.call_participants (session_id, user_id)
        WHERE status NOT IN ('left', 'rejected');
    `);

    // ── call_recordings ────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE calls.call_recordings (
        id                UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
        session_id        UUID            NOT NULL REFERENCES calls.call_sessions(id) ON DELETE CASCADE,
        status            calls.recording_status NOT NULL DEFAULT 'recording',
        storage_key       VARCHAR(500)    NULL,        -- MinIO object key once ready
        size_bytes        BIGINT          NULL,
        duration_seconds  INTEGER         NULL,
        classification    SMALLINT        NOT NULL DEFAULT 0
                          CHECK (classification BETWEEN 0 AND 3),
        started_at        TIMESTAMPTZ     NOT NULL DEFAULT now(),
        stopped_at        TIMESTAMPTZ     NULL,
        expires_at        TIMESTAMPTZ     NULL,        -- retention policy expiry
        initiated_by_id   UUID            NOT NULL,
        created_at        TIMESTAMPTZ     NOT NULL DEFAULT now(),
        updated_at        TIMESTAMPTZ     NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`
      CREATE INDEX idx_call_recordings_session ON calls.call_recordings (session_id);
      CREATE INDEX idx_call_recordings_expires ON calls.call_recordings (expires_at)
        WHERE expires_at IS NOT NULL AND status = 'ready';
    `);

    // ── call_schedules ─────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE calls.call_schedules (
        id                UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
        title             VARCHAR(200)    NOT NULL,
        description       TEXT            NULL,
        organizer_id      UUID            NOT NULL,
        channel_id        UUID            NULL,
        scheduled_start   TIMESTAMPTZ     NOT NULL,
        scheduled_end     TIMESTAMPTZ     NOT NULL,
        classification    SMALLINT        NOT NULL DEFAULT 0
                          CHECK (classification BETWEEN 0 AND 3),
        max_participants  SMALLINT        NOT NULL DEFAULT 50,
        session_id        UUID            NULL REFERENCES calls.call_sessions(id),
        cancelled_at      TIMESTAMPTZ     NULL,
        cancelled_by_id   UUID            NULL,
        created_at        TIMESTAMPTZ     NOT NULL DEFAULT now(),
        updated_at        TIMESTAMPTZ     NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`
      CREATE INDEX idx_call_schedules_start      ON calls.call_schedules (scheduled_start);
      CREATE INDEX idx_call_schedules_organizer  ON calls.call_schedules (organizer_id);
    `);

    // ── Trigger: updated_at ────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION calls.set_updated_at()
      RETURNS TRIGGER LANGUAGE plpgsql AS $$
      BEGIN NEW.updated_at = now(); RETURN NEW; END;
      $$
    `);
    for (const tbl of ['call_sessions', 'call_recordings', 'call_schedules']) {
      await queryRunner.query(`
        CREATE TRIGGER trg_${tbl.replace('call_', 'c')}_updated_at
          BEFORE UPDATE ON calls.${tbl}
          FOR EACH ROW EXECUTE FUNCTION calls.set_updated_at()
      `);
    }
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP SCHEMA IF EXISTS calls CASCADE`);
  }
}
