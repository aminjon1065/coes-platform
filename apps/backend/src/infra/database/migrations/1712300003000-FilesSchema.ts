import { MigrationInterface, QueryRunner } from 'typeorm';

export class FilesSchema1712300003000 implements MigrationInterface {
  name = 'FilesSchema1712300003000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── Enums ──────────────────────────────────────────────────────────────────

    await queryRunner.query(`
      CREATE TYPE files.scan_status AS ENUM (
        'pending', 'clean', 'infected', 'scan_failed'
      )
    `);

    await queryRunner.query(`
      CREATE TYPE files.permission_action AS ENUM (
        'read', 'download', 'write', 'delete', 'share'
      )
    `);

    await queryRunner.query(`
      CREATE TYPE files.permission_effect AS ENUM ('allow', 'deny')
    `);

    await queryRunner.query(`
      CREATE TYPE files.linked_entity_type AS ENUM (
        'task', 'document', 'message', 'channel'
      )
    `);

    // ── file_folders ───────────────────────────────────────────────────────────

    await queryRunner.query(`
      CREATE TABLE files.file_folders (
        id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name              VARCHAR(255) NOT NULL,
        parent_id         UUID REFERENCES files.file_folders(id) ON DELETE RESTRICT,
        owner_position_id UUID NOT NULL,
        classification    SMALLINT NOT NULL DEFAULT 1
          CONSTRAINT chk_folder_classification CHECK (classification BETWEEN 0 AND 3),
        description       TEXT,
        created_by_id     UUID NOT NULL,
        deleted_at        TIMESTAMPTZ,
        created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await queryRunner.query(`CREATE INDEX idx_file_folders_parent ON files.file_folders(parent_id)`);
    await queryRunner.query(`CREATE INDEX idx_file_folders_owner  ON files.file_folders(owner_position_id)`);

    await queryRunner.query(`
      CREATE TABLE files.folder_closure (
        ancestor_id   UUID NOT NULL REFERENCES files.file_folders(id) ON DELETE CASCADE,
        descendant_id UUID NOT NULL REFERENCES files.file_folders(id) ON DELETE CASCADE,
        depth         INT NOT NULL DEFAULT 0,
        PRIMARY KEY (ancestor_id, descendant_id)
      )
    `);

    // ── file_records ───────────────────────────────────────────────────────────

    await queryRunner.query(`
      CREATE TABLE files.file_records (
        id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        display_name       VARCHAR(500) NOT NULL,
        original_filename  VARCHAR(500) NOT NULL,
        mime_type          VARCHAR(100),
        folder_id          UUID REFERENCES files.file_folders(id) ON DELETE SET NULL,
        classification     SMALLINT NOT NULL DEFAULT 1
          CONSTRAINT chk_file_classification CHECK (classification BETWEEN 0 AND 3),
        owner_position_id  UUID NOT NULL,
        uploaded_by_id     UUID NOT NULL,
        current_version_id UUID,
        total_size_bytes   BIGINT NOT NULL DEFAULT 0,
        version_count      INT NOT NULL DEFAULT 0,
        scan_status        files.scan_status NOT NULL DEFAULT 'pending',
        scanned_at         TIMESTAMPTZ,
        deleted_at         TIMESTAMPTZ,
        created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await queryRunner.query(`CREATE INDEX idx_file_records_folder         ON files.file_records(folder_id)`);
    await queryRunner.query(`CREATE INDEX idx_file_records_owner          ON files.file_records(owner_position_id)`);
    await queryRunner.query(`CREATE INDEX idx_file_records_uploaded_by    ON files.file_records(uploaded_by_id)`);
    await queryRunner.query(`CREATE INDEX idx_file_records_scan_status    ON files.file_records(scan_status)`);
    await queryRunner.query(`CREATE INDEX idx_file_records_classification ON files.file_records(classification)`);

    // ── file_versions ─────────────────────────────────────────────────────────

    await queryRunner.query(`
      CREATE TABLE files.file_versions (
        id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        file_id        UUID NOT NULL REFERENCES files.file_records(id) ON DELETE CASCADE,
        version_number INT NOT NULL,
        storage_key    VARCHAR(1000) NOT NULL,
        size_bytes     BIGINT NOT NULL,
        sha256_hash    VARCHAR(64) NOT NULL,
        uploaded_by_id UUID NOT NULL,
        upload_note    VARCHAR(500),
        created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT uq_file_version UNIQUE (file_id, version_number)
      )
    `);

    await queryRunner.query(`CREATE INDEX idx_file_versions_file_id ON files.file_versions(file_id, version_number)`);

    // Close the deferred FK loop: file_records.current_version_id → file_versions.id
    await queryRunner.query(`
      ALTER TABLE files.file_records
        ADD CONSTRAINT fk_file_records_current_version
        FOREIGN KEY (current_version_id) REFERENCES files.file_versions(id)
        ON DELETE SET NULL DEFERRABLE INITIALLY DEFERRED
    `);

    // ── file_permissions ──────────────────────────────────────────────────────

    await queryRunner.query(`
      CREATE TABLE files.file_permissions (
        id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        file_id             UUID NOT NULL REFERENCES files.file_records(id) ON DELETE CASCADE,
        grantee_position_id UUID NOT NULL,
        action              files.permission_action NOT NULL,
        effect              files.permission_effect NOT NULL DEFAULT 'allow',
        granted_by_id       UUID NOT NULL,
        expires_at          TIMESTAMPTZ,
        revoked_at          TIMESTAMPTZ,
        created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT uq_file_permission UNIQUE (file_id, grantee_position_id, action)
      )
    `);

    await queryRunner.query(`CREATE INDEX idx_file_permissions_file_id ON files.file_permissions(file_id)`);
    await queryRunner.query(`CREATE INDEX idx_file_permissions_grantee ON files.file_permissions(grantee_position_id)`);

    // ── file_links ────────────────────────────────────────────────────────────

    await queryRunner.query(`
      CREATE TABLE files.file_links (
        id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        file_id            UUID NOT NULL REFERENCES files.file_records(id) ON DELETE CASCADE,
        linked_entity_id   UUID NOT NULL,
        linked_entity_type files.linked_entity_type NOT NULL,
        linked_by_id       UUID NOT NULL,
        linked_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT uq_file_link UNIQUE (file_id, linked_entity_id, linked_entity_type)
      )
    `);

    await queryRunner.query(`CREATE INDEX idx_file_links_entity ON files.file_links(linked_entity_id, linked_entity_type)`);
    await queryRunner.query(`CREATE INDEX idx_file_links_file   ON files.file_links(file_id)`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS files.file_links`);
    await queryRunner.query(`DROP TABLE IF EXISTS files.file_permissions`);
    await queryRunner.query(`ALTER TABLE files.file_records DROP CONSTRAINT IF EXISTS fk_file_records_current_version`);
    await queryRunner.query(`DROP TABLE IF EXISTS files.file_versions`);
    await queryRunner.query(`DROP TABLE IF EXISTS files.file_records`);
    await queryRunner.query(`DROP TABLE IF EXISTS files.folder_closure`);
    await queryRunner.query(`DROP TABLE IF EXISTS files.file_folders`);
    await queryRunner.query(`DROP TYPE IF EXISTS files.linked_entity_type`);
    await queryRunner.query(`DROP TYPE IF EXISTS files.permission_effect`);
    await queryRunner.query(`DROP TYPE IF EXISTS files.permission_action`);
    await queryRunner.query(`DROP TYPE IF EXISTS files.scan_status`);
  }
}
