import { MigrationInterface, QueryRunner } from 'typeorm';

export class ChatSchema1712300014000 implements MigrationInterface {
  name = 'ChatSchema1712300014000';

  async up(queryRunner: QueryRunner): Promise<void> {
    // Schema
    await queryRunner.query(`CREATE SCHEMA IF NOT EXISTS chat`);

    // Enums
    await queryRunner.query(`
      CREATE TYPE chat.channel_type AS ENUM (
        'direct', 'group', 'department',
        'task_linked', 'document_linked',
        'emergency_broadcast', 'system_notification'
      )
    `);
    await queryRunner.query(`
      CREATE TYPE chat.channel_status AS ENUM (
        'active', 'read_only', 'archived'
      )
    `);
    await queryRunner.query(`
      CREATE TYPE chat.member_role AS ENUM (
        'owner', 'member', 'observer'
      )
    `);
    await queryRunner.query(`
      CREATE TYPE chat.member_status AS ENUM (
        'active', 'removed', 'left'
      )
    `);
    await queryRunner.query(`
      CREATE TYPE chat.message_type AS ENUM (
        'text', 'system', 'file', 'emergency'
      )
    `);

    // ── channels ──────────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE chat.channels (
        id                    UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
        name                  VARCHAR(300)  NULL,
        description           TEXT          NULL,
        type                  chat.channel_type   NOT NULL,
        status                chat.channel_status NOT NULL DEFAULT 'active',
        classification        SMALLINT      NOT NULL DEFAULT 1,
        created_by_position_id VARCHAR      NULL,
        created_by_id         VARCHAR       NULL,
        linked_entity_id      VARCHAR       NULL,
        linked_entity_type    VARCHAR(50)   NULL,
        last_sequence         INTEGER       NOT NULL DEFAULT 0,
        retention_days        INTEGER       NULL,
        legal_hold            BOOLEAN       NOT NULL DEFAULT false,
        created_at            TIMESTAMPTZ   NOT NULL DEFAULT now(),
        updated_at            TIMESTAMPTZ   NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`
      CREATE INDEX idx_channels_type_status
        ON chat.channels (type, status);
      CREATE INDEX idx_channels_linked_entity
        ON chat.channels (linked_entity_id, linked_entity_type)
        WHERE linked_entity_id IS NOT NULL;
    `);

    // ── channel_members ───────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE chat.channel_members (
        id                  UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
        channel_id          UUID          NOT NULL REFERENCES chat.channels(id) ON DELETE CASCADE,
        position_id         VARCHAR       NOT NULL,
        user_id             VARCHAR       NULL,
        role                chat.member_role   NOT NULL DEFAULT 'member',
        status              chat.member_status NOT NULL DEFAULT 'active',
        join_source         VARCHAR(50)   NOT NULL DEFAULT 'explicit',
        muted_until         TIMESTAMPTZ   NULL,
        last_read_sequence  INTEGER       NOT NULL DEFAULT 0,
        removed_at          TIMESTAMPTZ   NULL,
        removed_by_id       VARCHAR       NULL,
        created_at          TIMESTAMPTZ   NOT NULL DEFAULT now(),
        updated_at          TIMESTAMPTZ   NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`
      CREATE INDEX idx_channel_members_position_status
        ON chat.channel_members (position_id, status);
      CREATE UNIQUE INDEX uq_channel_members_active_position
        ON chat.channel_members (channel_id, position_id)
        WHERE status = 'active';
    `);

    // ── messages ──────────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE chat.messages (
        id                UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
        channel_id        VARCHAR       NOT NULL,
        idempotency_key   VARCHAR       NULL,
        sequence          INTEGER       NOT NULL,
        type              chat.message_type NOT NULL DEFAULT 'text',
        sender_id         VARCHAR       NOT NULL,
        sender_position_id VARCHAR      NULL,
        body              TEXT          NULL,
        attachments       JSONB         NOT NULL DEFAULT '[]',
        system_payload    JSONB         NULL,
        parent_message_id VARCHAR       NULL,
        reply_count       INTEGER       NOT NULL DEFAULT 0,
        classification    SMALLINT      NOT NULL DEFAULT 1,
        is_edited         BOOLEAN       NOT NULL DEFAULT false,
        edited_at         TIMESTAMPTZ   NULL,
        is_deleted        BOOLEAN       NOT NULL DEFAULT false,
        deleted_at        TIMESTAMPTZ   NULL,
        deleted_by_id     VARCHAR       NULL,
        created_at        TIMESTAMPTZ   NOT NULL DEFAULT now(),
        updated_at        TIMESTAMPTZ   NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`
      CREATE INDEX idx_messages_channel_created
        ON chat.messages (channel_id, created_at);
      CREATE INDEX idx_messages_channel_sequence
        ON chat.messages (channel_id, sequence);
      CREATE UNIQUE INDEX uq_messages_idempotency
        ON chat.messages (idempotency_key)
        WHERE idempotency_key IS NOT NULL;
      CREATE INDEX idx_messages_parent
        ON chat.messages (parent_message_id)
        WHERE parent_message_id IS NOT NULL;
    `);

    // ── message_edits ─────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE chat.message_edits (
        id                    UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
        message_id            VARCHAR       NOT NULL,
        previous_body         TEXT          NULL,
        previous_attachments  JSONB         NOT NULL DEFAULT '[]',
        edited_by_id          VARCHAR       NOT NULL,
        edit_reason           VARCHAR(300)  NULL,
        created_at            TIMESTAMPTZ   NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`
      CREATE INDEX idx_message_edits_message_created
        ON chat.message_edits (message_id, created_at);
    `);

    // ── Trigger: updated_at ───────────────────────────────────────────────
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION chat.set_updated_at()
      RETURNS TRIGGER LANGUAGE plpgsql AS $$
      BEGIN NEW.updated_at = now(); RETURN NEW; END;
      $$
    `);
    for (const tbl of ['channels', 'channel_members', 'messages']) {
      await queryRunner.query(`
        CREATE TRIGGER trg_${tbl}_updated_at
          BEFORE UPDATE ON chat.${tbl}
          FOR EACH ROW EXECUTE FUNCTION chat.set_updated_at()
      `);
    }
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP SCHEMA IF EXISTS chat CASCADE`);
  }
}
