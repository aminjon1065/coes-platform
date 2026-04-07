import 'reflect-metadata';
import { AppDataSource } from './data-source';

type ManagedMarker = {
  schema: string;
  table: string;
};

const managedMarkers: ManagedMarker[] = [
  { schema: 'iam', table: 'user_credentials' },
  { schema: 'users', table: 'user_profiles' },
  { schema: 'org', table: 'departments' },
  { schema: 'authz', table: 'roles' },
  { schema: 'edms', table: 'documents' },
  { schema: 'files', table: 'file_records' },
  { schema: 'calls', table: 'call_sessions' },
  { schema: 'gis', table: 'spatial_layers' },
  { schema: 'analytics', table: 'incidents' },
  { schema: 'ml', table: 'ml_models' },
  { schema: 'reporting', table: 'report_definitions' },
  { schema: 'notifications', table: 'notifications' },
  { schema: 'chat', table: 'channels' },
  { schema: 'tasks', table: 'tasks' },
];

async function ensureMigrationsTable() {
  await AppDataSource.query(`
    CREATE TABLE IF NOT EXISTS "migrations" (
      "id" SERIAL NOT NULL,
      "timestamp" bigint NOT NULL,
      "name" character varying NOT NULL,
      CONSTRAINT "PK_8c82d7f526340ab734260ea46be" PRIMARY KEY ("id")
    )
  `);
}

async function countExecutedMigrations() {
  const rows = await AppDataSource.query(`SELECT COUNT(*)::int AS count FROM "migrations"`);
  return Number(rows[0]?.count ?? 0);
}

async function countManagedTables() {
  const predicates = managedMarkers
    .map(
      ({ schema, table }, index) =>
        `(table_schema = $${index * 2 + 1} AND table_name = $${index * 2 + 2})`,
    )
    .join(' OR ');

  const params = managedMarkers.flatMap(({ schema, table }) => [schema, table]);
  const rows = await AppDataSource.query(
    `
      SELECT COUNT(*)::int AS count
      FROM information_schema.tables
      WHERE ${predicates}
    `,
    params,
  );

  return Number(rows[0]?.count ?? 0);
}

function parseMigrationRecord(name: string) {
  const match = name.match(/(\d{13,})$/);

  if (!match) {
    throw new Error(`Cannot extract timestamp from migration name: ${name}`);
  }

  return {
    name,
    timestamp: Number(match[1]),
  };
}

async function baselineMigrations() {
  await AppDataSource.initialize();

  try {
    await ensureMigrationsTable();

    const executedCount = await countExecutedMigrations();
    if (executedCount > 0) {
      console.log(`Skipping baseline: migrations table already has ${executedCount} row(s).`);
      return;
    }

    const managedTableCount = await countManagedTables();
    if (managedTableCount === 0) {
      console.log('Skipping baseline: managed tables were not found. Run migration:run on this database.');
      return;
    }

    const migrations = [...AppDataSource.migrations]
      .map((migration) => {
        const resolvedName = migration.name ?? migration.constructor?.name;

        if (!resolvedName) {
          throw new Error('Encountered a migration without a name.');
        }

        return parseMigrationRecord(resolvedName);
      })
      .sort((left, right) => left.timestamp - right.timestamp);

    for (const migration of migrations) {
      await AppDataSource.query(
        `INSERT INTO "migrations" ("timestamp", "name") VALUES ($1, $2)`,
        [migration.timestamp, migration.name],
      );
    }

    console.log(
      `Baseline complete: marked ${migrations.length} migration(s) as executed for an existing schema-managed database.`,
    );
  } finally {
    await AppDataSource.destroy();
  }
}

baselineMigrations().catch((error) => {
  console.error('Failed to baseline migrations', error);
  process.exit(1);
});
