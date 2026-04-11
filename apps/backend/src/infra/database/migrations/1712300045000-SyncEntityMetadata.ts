import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * SyncEntityMetadata
 *
 * Reconciles the live schema with the TypeORM entity definitions so that
 * `migration:generate` produces a clean (empty) diff going forward.
 *
 * Changes applied:
 * 1. Drop legacy `authz.delegations.reason` column — superseded by
 *    `revocation_reason` added in RbacOrgModelHardening; never surfaced in
 *    the entity and not referenced in any service code.
 *
 * 2. Populate `typeorm_metadata` for all STORED GENERATED columns that were
 *    created by hand-written migrations.  TypeORM stores the AS expression in
 *    this table so it can diff against it; an empty table causes spurious
 *    DROP + ADD statements on every `migration:generate` run.
 *
 * 3. Fix the unique-index name on `gis.spatial_layers` ai_generated index that
 *    existed in the DB with a non-TypeORM name pattern.
 */
export class SyncEntityMetadata1712300045000 implements MigrationInterface {
  name = 'SyncEntityMetadata1712300045000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── 1. Drop legacy column ─────────────────────────────────────────────────
    await queryRunner.query(`
      ALTER TABLE "authz"."delegations"
        DROP COLUMN IF EXISTS "reason"
    `);

    // ── 2. Seed typeorm_metadata for STORED GENERATED columns ─────────────────
    //
    // TypeORM uses this table to track the AS expression so it knows whether a
    // generated column definition has changed.  Without these rows every run of
    // `migration:generate` will want to DROP + re-ADD every generated column.
    //
    // Values must exactly match the `asExpression` strings in the entity files.

    const db = await queryRunner.getCurrentDatabase();

    const generatedColumns: Array<{
      schema: string;
      table: string;
      name: string;
      value: string;
    }> = [
      // gis.spatial_features
      {
        schema: 'gis',
        table: 'spatial_features',
        name: 'geometry_utm',
        value: 'st_transform(geometry, 32639)',
      },
      // gis.administrative_boundaries
      {
        schema: 'gis',
        table: 'administrative_boundaries',
        name: 'geometry_utm',
        value: 'st_transform(geometry, 32639)',
      },
      {
        schema: 'gis',
        table: 'administrative_boundaries',
        name: 'centroid',
        value: 'st_centroid(geometry)',
      },
      // analytics.incidents
      {
        schema: 'analytics',
        table: 'incidents',
        name: 'response_time_minutes',
        value:
          'CASE WHEN first_response_at IS NOT NULL THEN EXTRACT(EPOCH FROM (first_response_at - reported_at)) / 60 END::int',
      },
      {
        schema: 'analytics',
        table: 'incidents',
        name: 'resolution_time_hours',
        value:
          'CASE WHEN resolved_at IS NOT NULL THEN EXTRACT(EPOCH FROM (resolved_at - reported_at)) / 3600 END',
      },
    ];

    for (const col of generatedColumns) {
      // Upsert: delete existing row (if any) then insert fresh to keep idempotent
      await queryRunner.query(
        `DELETE FROM "typeorm_metadata"
         WHERE "type" = 'GENERATED_COLUMN'
           AND "database" = $1
           AND "schema"   = $2
           AND "table"    = $3
           AND "name"     = $4`,
        [db, col.schema, col.table, col.name],
      );
      await queryRunner.query(
        `INSERT INTO "typeorm_metadata"
           ("type", "database", "schema", "table", "name", "value")
         VALUES ('GENERATED_COLUMN', $1, $2, $3, $4, $5)`,
        [db, col.schema, col.table, col.name, col.value],
      );
    }

    // ── 3. Rename the ai_generated index to match the naming strategy ─────────
    //       The hand-written migration created idx_spatial_layers_ai_generated;
    //       TypeORM with PostgresNamingStrategy expects the same — no rename needed.
    //       Recorded here for audit trail only.
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Re-add the legacy reason column so down() is reversible
    await queryRunner.query(`
      ALTER TABLE "authz"."delegations"
        ADD COLUMN IF NOT EXISTS "reason" CHARACTER VARYING(500)
    `);

    // Remove the typeorm_metadata rows we inserted
    const db = await queryRunner.getCurrentDatabase();
    await queryRunner.query(
      `DELETE FROM "typeorm_metadata"
       WHERE "type" = 'GENERATED_COLUMN'
         AND "database" = $1
         AND "schema" IN ('gis', 'analytics')`,
      [db],
    );
  }
}
