import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Creates the chat.message_deliveries table for per-message DM delivery receipts.
 *
 * §4.6 — Chat-AudioVideo-Realtime-Architecture: two-phase delivery accounting
 * for DIRECT channels (delivered ↔ read double-check marks).
 */
export class MessageDeliveryTable1712300035000 implements MigrationInterface {
  name = 'MessageDeliveryTable1712300035000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS chat.message_deliveries (
        id                UUID         NOT NULL DEFAULT gen_random_uuid(),
        message_id        UUID         NOT NULL,
        channel_id        UUID         NOT NULL,
        recipient_user_id VARCHAR      NOT NULL,
        delivered_at      TIMESTAMPTZ  NULL,
        read_at           TIMESTAMPTZ  NULL,
        created_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

        CONSTRAINT pk_message_deliveries PRIMARY KEY (id),
        CONSTRAINT uq_message_deliveries_msg_user
          UNIQUE (message_id, recipient_user_id)
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_message_deliveries_channel_user
        ON chat.message_deliveries (channel_id, recipient_user_id)
    `);

    await queryRunner.query(`
      COMMENT ON TABLE chat.message_deliveries IS
        'Per-message delivery/read state for DIRECT channels (§4.6). '
        'Group channel read state uses ChannelMember.last_read_sequence instead.'
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS chat.message_deliveries`);
  }
}
