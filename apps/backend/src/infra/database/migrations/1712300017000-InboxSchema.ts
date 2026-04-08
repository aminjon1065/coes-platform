import { MigrationInterface, QueryRunner } from 'typeorm';

export class InboxSchema1712300017000 implements MigrationInterface {
  name = 'InboxSchema1712300017000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE public.inbox_messages (
        id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        message_key  VARCHAR(255) NOT NULL,
        consumer     VARCHAR(120) NOT NULL,
        event_type   VARCHAR(160) NOT NULL,
        status       VARCHAR(32)  NOT NULL DEFAULT 'processing',
        attempts     INT          NOT NULL DEFAULT 0,
        payload_hash VARCHAR(64)  NOT NULL,
        last_error   TEXT         NULL,
        created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        updated_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
      )
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX uq_inbox_messages_key
        ON public.inbox_messages (message_key)
    `);

    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION public.set_inbox_updated_at()
      RETURNS TRIGGER AS $$
      BEGIN
        NEW.updated_at = NOW();
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql
    `);

    await queryRunner.query(`
      CREATE TRIGGER trg_inbox_messages_updated_at
      BEFORE UPDATE ON public.inbox_messages
      FOR EACH ROW EXECUTE FUNCTION public.set_inbox_updated_at()
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TRIGGER IF EXISTS trg_inbox_messages_updated_at ON public.inbox_messages`);
    await queryRunner.query(`DROP FUNCTION IF EXISTS public.set_inbox_updated_at`);
    await queryRunner.query(`DROP INDEX IF EXISTS public.uq_inbox_messages_key`);
    await queryRunner.query(`DROP TABLE IF EXISTS public.inbox_messages`);
  }
}
