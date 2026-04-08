import { MigrationInterface, QueryRunner } from 'typeorm';

export class InboxPayloadAndReliabilityControls1712300018000
  implements MigrationInterface
{
  name = 'InboxPayloadAndReliabilityControls1712300018000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "public"."inbox_messages"
      ADD COLUMN IF NOT EXISTS "payload" jsonb NOT NULL DEFAULT '{}'::jsonb
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "public"."inbox_messages"
      DROP COLUMN IF EXISTS "payload"
    `);
  }
}
