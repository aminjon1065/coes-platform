import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * EDMS schema: document_types, documents, document_versions,
 * document_attachments, registration_records
 */
export class EdmsSchema1712300002000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Ensure schema exists (idempotent)
    await queryRunner.query(`CREATE SCHEMA IF NOT EXISTS edms`);

    // ─── document_types ───────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE edms.document_types (
        id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name                   VARCHAR(200) NOT NULL,
        name_ru                VARCHAR(200),
        name_tg                VARCHAR(200),
        series_code            VARCHAR(20)  NOT NULL,
        default_classification SMALLINT     NOT NULL DEFAULT 1,
        requires_resolution    BOOLEAN      NOT NULL DEFAULT FALSE,
        requires_approval      BOOLEAN      NOT NULL DEFAULT FALSE,
        default_deadline_days  INTEGER,
        retention_years        INTEGER      NOT NULL DEFAULT 5,
        active                 BOOLEAN      NOT NULL DEFAULT TRUE,
        created_at             TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        updated_at             TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        CONSTRAINT uq_document_types_series UNIQUE (series_code)
      )
    `);

    // ─── documents ────────────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TYPE edms.document_status AS ENUM (
        'draft', 'registered', 'in_workflow', 'completed', 'archived', 'cancelled'
      )
    `);
    await queryRunner.query(`
      CREATE TYPE edms.document_direction AS ENUM (
        'incoming', 'outgoing', 'internal'
      )
    `);

    await queryRunner.query(`
      CREATE TABLE edms.documents (
        id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        type_id               UUID         NOT NULL REFERENCES edms.document_types(id) ON DELETE RESTRICT,
        status                edms.document_status    NOT NULL DEFAULT 'draft',
        direction             edms.document_direction NOT NULL DEFAULT 'internal',
        subject               VARCHAR(500) NOT NULL,
        registration_number   VARCHAR(50),
        registered_at         TIMESTAMPTZ,
        document_date         DATE,
        classification        SMALLINT     NOT NULL DEFAULT 1
          CONSTRAINT chk_doc_classification CHECK (classification BETWEEN 0 AND 3),
        sender_position_id    UUID,
        sender_name           VARCHAR(300),
        external_ref_number   VARCHAR(100),
        recipients            JSONB        NOT NULL DEFAULT '[]',
        body                  TEXT,
        deadline              DATE,
        related_document_id   UUID REFERENCES edms.documents(id) ON DELETE SET NULL,
        created_by_id         UUID         NOT NULL,
        created_by_position_id UUID,
        cancelled_at          TIMESTAMPTZ,
        cancel_reason         VARCHAR(500),
        created_at            TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        updated_at            TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        CONSTRAINT uq_documents_registration_number UNIQUE NULLS NOT DISTINCT (registration_number)
          DEFERRABLE INITIALLY DEFERRED
      )
    `);

    await queryRunner.query(`
      CREATE INDEX idx_documents_status_created
        ON edms.documents(status, created_at)
    `);
    await queryRunner.query(`
      CREATE INDEX idx_documents_type_status
        ON edms.documents(type_id, status)
    `);

    // ─── document_versions ────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE edms.document_versions (
        id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        document_id     UUID    NOT NULL REFERENCES edms.documents(id) ON DELETE CASCADE,
        version_number  INTEGER NOT NULL,
        subject         VARCHAR(500) NOT NULL,
        body            TEXT,
        recipients      JSONB   NOT NULL DEFAULT '[]',
        author_id       UUID    NOT NULL,
        change_reason   VARCHAR(500),
        created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await queryRunner.query(`
      CREATE INDEX idx_doc_versions_document_id
        ON edms.document_versions(document_id, version_number)
    `);

    // ─── attachment_role enum + document_attachments ──────────────────────────
    await queryRunner.query(`
      CREATE TYPE edms.attachment_role AS ENUM (
        'primary_body', 'annex', 'supporting', 'signature'
      )
    `);
    await queryRunner.query(`
      CREATE TABLE edms.document_attachments (
        id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        document_id      UUID        NOT NULL REFERENCES edms.documents(id) ON DELETE CASCADE,
        file_id          UUID        NOT NULL,
        filename         VARCHAR(255) NOT NULL,
        mime_type        VARCHAR(100),
        file_size_bytes  BIGINT,
        role             edms.attachment_role NOT NULL DEFAULT 'supporting',
        classification   SMALLINT    NOT NULL DEFAULT 1
          CONSTRAINT chk_attach_classification CHECK (classification BETWEEN 0 AND 3),
        uploaded_by_id   UUID        NOT NULL,
        removed_at       TIMESTAMPTZ,
        created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await queryRunner.query(`
      CREATE INDEX idx_doc_attachments_document_role
        ON edms.document_attachments(document_id, role)
    `);

    // ─── registration_records ─────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE edms.registration_records (
        id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        document_id           UUID        NOT NULL,
        registration_number   VARCHAR(50) NOT NULL,
        series_code           VARCHAR(20) NOT NULL,
        sequence_number       INTEGER     NOT NULL,
        year                  SMALLINT    NOT NULL,
        registrar_id          UUID        NOT NULL,
        registrar_position_id UUID,
        registered_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT uq_reg_document UNIQUE (document_id),
        CONSTRAINT uq_reg_series_seq_year UNIQUE (series_code, sequence_number, year)
      )
    `);

    // ─── Seed default document types ──────────────────────────────────────────
    await queryRunner.query(`
      INSERT INTO edms.document_types
        (name, name_ru, name_tg, series_code, default_classification, requires_resolution, requires_approval, default_deadline_days, retention_years)
      VALUES
        ('Incoming Correspondence', 'Входящая корреспонденция',  'Мактубот воридшаванда', 'ВС',  1, TRUE,  FALSE, 10, 5),
        ('Outgoing Letter',         'Исходящее письмо',          'Мактуби содиршаванда',  'ИС',  1, FALSE, FALSE, NULL, 5),
        ('Internal Order',          'Внутренний приказ',         'Фармони дохилӣ',        'ВП',  2, FALSE, TRUE,  30, 10),
        ('Directive',               'Директива',                 'Дастурамал',            'ДИ',  2, FALSE, TRUE,  NULL, 15),
        ('Memo',                    'Служебная записка',         'Ёддошт',                'СЗ',  1, FALSE, FALSE, 5,  3)
      ON CONFLICT (series_code) DO NOTHING
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS edms.registration_records`);
    await queryRunner.query(`DROP TABLE IF EXISTS edms.document_attachments`);
    await queryRunner.query(`DROP TYPE  IF EXISTS edms.attachment_role`);
    await queryRunner.query(`DROP TABLE IF EXISTS edms.document_versions`);
    await queryRunner.query(`DROP TABLE IF EXISTS edms.documents`);
    await queryRunner.query(`DROP TYPE  IF EXISTS edms.document_direction`);
    await queryRunner.query(`DROP TYPE  IF EXISTS edms.document_status`);
    await queryRunner.query(`DROP TABLE IF EXISTS edms.document_types`);
  }
}
