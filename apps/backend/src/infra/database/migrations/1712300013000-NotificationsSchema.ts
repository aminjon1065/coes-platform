import { MigrationInterface, QueryRunner } from 'typeorm';

export class NotificationsSchema1712300013000 implements MigrationInterface {
  name = 'NotificationsSchema1712300013000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE SCHEMA IF NOT EXISTS notifications`);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM pg_type t
          JOIN pg_namespace n ON n.oid = t.typnamespace
          WHERE t.typname = 'notification_priority'
            AND n.nspname = 'notifications'
        ) THEN
          CREATE TYPE notifications.notification_priority AS ENUM ('low', 'normal', 'high', 'critical');
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM pg_type t
          JOIN pg_namespace n ON n.oid = t.typnamespace
          WHERE t.typname = 'delivery_channel'
            AND n.nspname = 'notifications'
        ) THEN
          CREATE TYPE notifications.delivery_channel AS ENUM ('in_app', 'email', 'sms');
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      ALTER TYPE notifications.delivery_channel
      ADD VALUE IF NOT EXISTS 'push'
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM pg_type t
          JOIN pg_namespace n ON n.oid = t.typnamespace
          WHERE t.typname = 'delivery_status'
            AND n.nspname = 'notifications'
        ) THEN
          CREATE TYPE notifications.delivery_status AS ENUM ('pending', 'sent', 'failed', 'skipped');
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM pg_type t
          JOIN pg_namespace n ON n.oid = t.typnamespace
          WHERE t.typname = 'push_subscription_status'
            AND n.nspname = 'notifications'
        ) THEN
          CREATE TYPE notifications.push_subscription_status AS ENUM ('active', 'expired', 'invalid');
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS notifications.notifications (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        type VARCHAR(100) NOT NULL,
        recipient_position_id UUID NOT NULL,
        recipient_user_id UUID,
        priority notifications.notification_priority NOT NULL DEFAULT 'normal',
        title VARCHAR(255) NOT NULL,
        body TEXT,
        payload JSONB,
        action_url VARCHAR(500),
        is_read BOOLEAN NOT NULL DEFAULT FALSE,
        read_at TIMESTAMPTZ,
        expires_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS notifications.notification_preferences (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL,
        notification_type VARCHAR(100),
        in_app BOOLEAN NOT NULL DEFAULT TRUE,
        email BOOLEAN NOT NULL DEFAULT TRUE,
        sms BOOLEAN NOT NULL DEFAULT FALSE,
        push BOOLEAN NOT NULL DEFAULT TRUE,
        email_throttle_minutes INT NOT NULL DEFAULT 0,
        sms_min_priority notifications.notification_priority NOT NULL DEFAULT 'high',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await queryRunner.query(`
      ALTER TABLE notifications.notification_preferences
      ADD COLUMN IF NOT EXISTS push BOOLEAN NOT NULL DEFAULT TRUE
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS notifications.notification_deliveries (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        notification_id UUID NOT NULL REFERENCES notifications.notifications(id) ON DELETE CASCADE,
        channel notifications.delivery_channel NOT NULL,
        status notifications.delivery_status NOT NULL DEFAULT 'pending',
        attempts INT NOT NULL DEFAULT 0,
        last_attempt_at TIMESTAMPTZ,
        sent_at TIMESTAMPTZ,
        error TEXT,
        provider_message_id VARCHAR(255),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS notifications.push_subscriptions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL,
        endpoint TEXT NOT NULL,
        p256dh_key VARCHAR(255) NOT NULL,
        auth_key VARCHAR(255) NOT NULL,
        expiration_time TIMESTAMPTZ,
        user_agent VARCHAR(512),
        status notifications.push_subscription_status NOT NULL DEFAULT 'active',
        failure_count INT NOT NULL DEFAULT 0,
        last_success_at TIMESTAMPTZ,
        last_failure_at TIMESTAMPTZ,
        last_failure_reason TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_notification_preferences_user_type
      ON notifications.notification_preferences (user_id, notification_type)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_notifications_recipient_position_read_created
      ON notifications.notifications (recipient_position_id, is_read, created_at)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_notifications_recipient_user_read_created
      ON notifications.notifications (recipient_user_id, is_read, created_at)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_notification_deliveries_notification_channel
      ON notifications.notification_deliveries (notification_id, channel)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_notification_deliveries_status_channel_attempt
      ON notifications.notification_deliveries (status, channel, last_attempt_at)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user_status
      ON notifications.push_subscriptions (user_id, status)
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_push_subscriptions_endpoint
      ON notifications.push_subscriptions (endpoint)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS notifications.uq_push_subscriptions_endpoint`);
    await queryRunner.query(`DROP INDEX IF EXISTS notifications.idx_push_subscriptions_user_status`);
    await queryRunner.query(`DROP TABLE IF EXISTS notifications.push_subscriptions`);
  }
}
