import 'reflect-metadata';
import type { QueryRunner } from 'typeorm';
import { AppDataSource } from './data-source';

async function ensureTypeormMetadata() {
  await AppDataSource.initialize();

  const queryRunner = AppDataSource.createQueryRunner();

  try {
    const schemaBuilder = AppDataSource.driver.createSchemaBuilder() as {
      createMetadataTableIfNecessary?: (queryRunner: QueryRunner) => Promise<void>;
    };

    if (typeof schemaBuilder.createMetadataTableIfNecessary === 'function') {
      await schemaBuilder.createMetadataTableIfNecessary(queryRunner);
    }

    for (const entityMetadata of AppDataSource.entityMetadatas) {
      const tableName = AppDataSource.driver.parseTableName(entityMetadata);
      const database = tableName.database ?? AppDataSource.driver.database ?? null;
      const schema = tableName.schema ?? AppDataSource.driver.schema ?? null;

      for (const column of entityMetadata.columns) {
        if (column.generatedType !== 'STORED' || !column.asExpression) {
          continue;
        }

        await queryRunner.query(
          `
            INSERT INTO "typeorm_metadata" ("type", "database", "schema", "table", "name", "value")
            SELECT $1::varchar, $2::varchar, $3::varchar, $4::varchar, $5::varchar, $6::text
            WHERE NOT EXISTS (
              SELECT 1
              FROM "typeorm_metadata" "t"
              WHERE "t"."type" = $1::varchar
                AND "t"."database" IS NOT DISTINCT FROM $2::varchar
                AND "t"."schema" IS NOT DISTINCT FROM $3::varchar
                AND "t"."table" = $4::varchar
                AND "t"."name" = $5::varchar
            )
          `,
          [
            'GENERATED_COLUMN',
            database,
            schema,
            tableName.tableName,
            column.databaseName,
            column.asExpression,
          ],
        );
      }
    }
  } finally {
    await queryRunner.release();
    await AppDataSource.destroy();
  }
}

ensureTypeormMetadata().catch((error) => {
  console.error('Failed to ensure typeorm metadata', error);
  process.exit(1);
});
