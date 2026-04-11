import { DefaultNamingStrategy, NamingStrategyInterface, Table } from 'typeorm';

/**
 * PostgresNamingStrategy
 *
 * Generates human-readable constraint and index names that match the
 * hand-written SQL migrations in this project, following standard PostgreSQL
 * naming conventions.
 *
 * Default TypeORM strategy generates hash-based names (FK_abc123...) which
 * creates noisy diffs when running `migration:generate` against a database
 * built from hand-written migrations.
 *
 * Conventions:
 *   FK:     {table}_{columns}_fkey       e.g. user_preferences_user_id_fkey
 *   PK:     {table}_pkey                 e.g. users_pkey
 *   UQ:     uq_{table}_{columns}         e.g. uq_mfa_credentials_user_id
 *   Index:  idx_{table}_{columns}        e.g. idx_spatial_layers_status
 */
export class PostgresNamingStrategy
  extends DefaultNamingStrategy
  implements NamingStrategyInterface
{
  /** Strip schema prefix so "authz.delegations" → "delegations" */
  private shortName(tableOrName: Table | string): string {
    const name =
      typeof tableOrName === 'string' ? tableOrName : tableOrName.name;
    return name.includes('.') ? name.split('.').pop()! : name;
  }

  foreignKeyName(
    tableOrName: Table | string,
    columnNames: string[],
    _referencedTablePath?: string,
    _referencedColumnNames?: string[],
  ): string {
    return `${this.shortName(tableOrName)}_${columnNames.join('_')}_fkey`;
  }

  primaryKeyName(tableOrName: Table | string, columnNames: string[]): string {
    return `${this.shortName(tableOrName)}_pkey`;
  }

  uniqueConstraintName(
    tableOrName: Table | string,
    columnNames: string[],
  ): string {
    return `uq_${this.shortName(tableOrName)}_${columnNames.join('_')}`;
  }

  indexName(
    tableOrName: Table | string,
    columns: string[],
    _where?: string,
  ): string {
    return `idx_${this.shortName(tableOrName)}_${columns.join('_')}`;
  }
}
