import { MigrationInterface, QueryRunner } from 'typeorm';

export class OutboxSchema1712300016000 implements MigrationInterface {
  name = 'OutboxSchema1712300016000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE public.outbox_events (
        id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        event_type      VARCHAR(160) NOT NULL,
        payload         JSONB        NOT NULL,
        status          VARCHAR(32)  NOT NULL DEFAULT 'pending',
        source          VARCHAR(120) NULL,
        aggregate_type  VARCHAR(120) NULL,
        aggregate_id    UUID         NULL,
        attempts        INT          NOT NULL DEFAULT 0,
        max_attempts    INT          NOT NULL DEFAULT 10,
        available_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        last_attempt_at TIMESTAMPTZ  NULL,
        dispatched_at   TIMESTAMPTZ  NULL,
        last_error      TEXT         NULL,
        created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
      )
    `);

    await queryRunner.query(`
      CREATE INDEX idx_outbox_status_available
        ON public.outbox_events (status, available_at)
    `);

    await queryRunner.query(`
      CREATE INDEX idx_outbox_event_type_created
        ON public.outbox_events (event_type, created_at)
    `);

    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION public.set_outbox_updated_at()
      RETURNS TRIGGER AS $$
      BEGIN
        NEW.updated_at = NOW();
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql
    `);

    await queryRunner.query(`
      CREATE TRIGGER trg_outbox_events_updated_at
      BEFORE UPDATE ON public.outbox_events
      FOR EACH ROW EXECUTE FUNCTION public.set_outbox_updated_at()
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TRIGGER IF EXISTS trg_outbox_events_updated_at ON public.outbox_events`);
    await queryRunner.query(`DROP FUNCTION IF EXISTS public.set_outbox_updated_at`);
    await queryRunner.query(`DROP INDEX IF EXISTS public.idx_outbox_event_type_created`);
    await queryRunner.query(`DROP INDEX IF EXISTS public.idx_outbox_status_available`);
    await queryRunner.query(`DROP TABLE IF EXISTS public.outbox_events`);
  }
}
