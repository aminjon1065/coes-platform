import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds archive-tracking columns to edms.documents:
 *   archived_at           — when the document was moved to ARCHIVED
 *   archived_by_id        — credential ID of the user who archived it
 *   retention_review_date — computed deadline: archivedAt + documentType.retentionYears
 */
export class EdmsArchiveFields1712300004000 implements MigrationInterface {
  name = 'EdmsArchiveFields1712300004000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE edms.documents
        ADD COLUMN IF NOT EXISTS archived_at           TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS archived_by_id        UUID,
        ADD COLUMN IF NOT EXISTS retention_review_date DATE
    `);

    await queryRunner.query(`
      CREATE INDEX idx_documents_retention_review
        ON edms.documents(retention_review_date)
        WHERE status = 'archived' AND retention_review_date IS NOT NULL
    `);

    // Partial index for auto-archive job: quickly find COMPLETED docs older than threshold
    await queryRunner.query(`
      CREATE INDEX idx_documents_completed_updated
        ON edms.documents(updated_at)
        WHERE status = 'completed'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS edms.idx_documents_completed_updated`);
    await queryRunner.query(`DROP INDEX IF EXISTS edms.idx_documents_retention_review`);
    await queryRunner.query(`
      ALTER TABLE edms.documents
        DROP COLUMN IF EXISTS retention_review_date,
        DROP COLUMN IF EXISTS archived_by_id,
        DROP COLUMN IF EXISTS archived_at
    `);
  }
}
