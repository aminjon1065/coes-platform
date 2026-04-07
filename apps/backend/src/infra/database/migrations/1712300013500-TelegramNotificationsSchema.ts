import { MigrationInterface, QueryRunner } from 'typeorm';

export class TelegramNotificationsSchema1712300013500 implements MigrationInterface {
  name = 'TelegramNotificationsSchema1712300013500';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TYPE notifications.delivery_channel
      ADD VALUE IF NOT EXISTS 'telegram'
    `);

    await queryRunner.query(`
      ALTER TABLE notifications.notification_preferences
      ADD COLUMN IF NOT EXISTS telegram BOOLEAN NOT NULL DEFAULT FALSE
    `);

    await queryRunner.query(`
      ALTER TABLE notifications.notification_preferences
      ADD COLUMN IF NOT EXISTS telegram_min_priority notifications.notification_priority NOT NULL DEFAULT 'high'
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM pg_type t
          JOIN pg_namespace n ON n.oid = t.typnamespace
          WHERE t.typname = 'telegram_subscription_status'
            AND n.nspname = 'notifications'
        ) THEN
          CREATE TYPE notifications.telegram_subscription_status AS ENUM ('active', 'revoked', 'invalid');
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS notifications.telegram_subscriptions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL,
        chat_id VARCHAR(64) NOT NULL,
        username VARCHAR(255),
        display_name VARCHAR(255),
        status notifications.telegram_subscription_status NOT NULL DEFAULT 'active',
        last_success_at TIMESTAMPTZ,
        last_failure_at TIMESTAMPTZ,
        last_failure_reason TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_telegram_subscriptions_user_id
      ON notifications.telegram_subscriptions (user_id)
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_telegram_subscriptions_chat_id
      ON notifications.telegram_subscriptions (chat_id)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS notifications.uq_telegram_subscriptions_chat_id`);
    await queryRunner.query(`DROP INDEX IF EXISTS notifications.uq_telegram_subscriptions_user_id`);
    await queryRunner.query(`DROP TABLE IF EXISTS notifications.telegram_subscriptions`);
    await queryRunner.query(`DROP TYPE IF EXISTS notifications.telegram_subscription_status`);
  }
}
