import { MigrationInterface, QueryRunner } from 'typeorm';

export class GisSchema1712300006000 implements MigrationInterface {
  name = 'GisSchema1712300006000';

  async up(queryRunner: QueryRunner): Promise<void> {
    // PostGIS extension (requires postgis/postgis docker image)
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS postgis`);
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS postgis_topology`);

    // Schema (already exists from init SQL, but idempotent)
    await queryRunner.query(`CREATE SCHEMA IF NOT EXISTS gis`);

    // ── Enums ──────────────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TYPE gis.geometry_type AS ENUM (
        'point', 'linestring', 'polygon', 'multipoint',
        'multilinestring', 'multipolygon', 'geometry_collection', 'raster'
      )
    `);

    await queryRunner.query(`
      CREATE TYPE gis.update_cadence AS ENUM (
        'real_time', 'hourly', 'daily', 'weekly', 'monthly', 'on_demand', 'static'
      )
    `);

    await queryRunner.query(`
      CREATE TYPE gis.layer_status AS ENUM (
        'active', 'draft', 'deprecated', 'archived'
      )
    `);

    await queryRunner.query(`
      CREATE TYPE gis.hazard_class AS ENUM (
        'flood', 'landslide', 'seismic', 'wildfire', 'avalanche',
        'drought', 'industrial', 'biological', 'compound'
      )
    `);

    await queryRunner.query(`
      CREATE TYPE gis.hazard_severity AS ENUM (
        'low', 'medium', 'high', 'critical'
      )
    `);

    await queryRunner.query(`
      CREATE TYPE gis.quality_status AS ENUM (
        'unvalidated', 'valid', 'invalid', 'needs_review'
      )
    `);

    // ── spatial_layers ─────────────────────────────────────────────────────
    // Layer catalog: every spatial dataset/theme is registered here
    await queryRunner.query(`
      CREATE TABLE gis.spatial_layers (
        id                  UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
        name                VARCHAR(200)    NOT NULL,
        description         TEXT            NULL,
        geometry_type       gis.geometry_type NOT NULL,
        srid                INTEGER         NOT NULL DEFAULT 4326,
        classification      SMALLINT        NOT NULL DEFAULT 0
                            CHECK (classification BETWEEN 0 AND 3),
        owner_position_id   UUID            NOT NULL,
        update_cadence      gis.update_cadence NOT NULL DEFAULT 'on_demand',
        status              gis.layer_status NOT NULL DEFAULT 'draft',
        quality_status      gis.quality_status NOT NULL DEFAULT 'unvalidated',
        last_validated_at   TIMESTAMPTZ     NULL,
        source_name         VARCHAR(300)    NULL,       -- originating data source
        source_url          TEXT            NULL,
        keywords            TEXT[]          NOT NULL DEFAULT '{}',
        schema_definition   JSONB           NULL,       -- attribute field definitions
        symbology           JSONB           NULL,       -- client-side rendering rules
        feature_count       INTEGER         NOT NULL DEFAULT 0,
        extent_geojson      JSONB           NULL,       -- bounding box as GeoJSON
        retention_days      INTEGER         NULL,       -- NULL = keep forever
        published_at        TIMESTAMPTZ     NULL,
        deprecated_at       TIMESTAMPTZ     NULL,
        created_by_id       UUID            NOT NULL,
        created_at          TIMESTAMPTZ     NOT NULL DEFAULT now(),
        updated_at          TIMESTAMPTZ     NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`
      CREATE INDEX idx_spatial_layers_status         ON gis.spatial_layers (status);
      CREATE INDEX idx_spatial_layers_geometry_type  ON gis.spatial_layers (geometry_type);
      CREATE INDEX idx_spatial_layers_classification ON gis.spatial_layers (classification);
      CREATE INDEX idx_spatial_layers_keywords       ON gis.spatial_layers USING GIN (keywords);
    `);

    // ── spatial_features ──────────────────────────────────────────────────
    // Generic feature store — all vector layers share this table (partitioned
    // by layer_id for large datasets). Geometry stored in WGS84 (SRID 4326).
    await queryRunner.query(`
      CREATE TABLE gis.spatial_features (
        id              UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
        layer_id        UUID            NOT NULL REFERENCES gis.spatial_layers(id) ON DELETE CASCADE,
        external_id     VARCHAR(200)    NULL,           -- source system identifier
        properties      JSONB           NOT NULL DEFAULT '{}',
        classification  SMALLINT        NOT NULL DEFAULT 0
                        CHECK (classification BETWEEN 0 AND 3),
        -- PostGIS geometry column (WGS84, accepts any geometry subtype)
        geometry        geometry(Geometry, 4326) NOT NULL,
        -- Pre-computed projected geometry (UTM Zone 39N, EPSG:32639) for metric ops
        geometry_utm    geometry(Geometry, 32639) GENERATED ALWAYS AS (
                          ST_Transform(geometry, 32639)
                        ) STORED,
        valid_from      TIMESTAMPTZ     NULL,
        valid_to        TIMESTAMPTZ     NULL,           -- NULL = currently valid
        source_ref      VARCHAR(500)    NULL,
        created_by_id   UUID            NOT NULL,
        created_at      TIMESTAMPTZ     NOT NULL DEFAULT now(),
        updated_at      TIMESTAMPTZ     NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`
      CREATE INDEX idx_spatial_features_layer     ON gis.spatial_features (layer_id);
      CREATE INDEX idx_spatial_features_geom      ON gis.spatial_features USING GIST (geometry);
      CREATE INDEX idx_spatial_features_geom_utm  ON gis.spatial_features USING GIST (geometry_utm);
      CREATE INDEX idx_spatial_features_props     ON gis.spatial_features USING GIN (properties);
      CREATE INDEX idx_spatial_features_valid     ON gis.spatial_features (layer_id, valid_from, valid_to)
        WHERE valid_to IS NULL;
      CREATE UNIQUE INDEX uq_spatial_features_ext_id
        ON gis.spatial_features (layer_id, external_id)
        WHERE external_id IS NOT NULL;
    `);

    // ── hazard_zones ──────────────────────────────────────────────────────
    // Specialised table for hazard zones with domain-specific attributes.
    // Each hazard zone is also a feature in a hazard layer (feature_id FK).
    await queryRunner.query(`
      CREATE TABLE gis.hazard_zones (
        id                  UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
        feature_id          UUID            NOT NULL REFERENCES gis.spatial_features(id) ON DELETE CASCADE,
        hazard_class        gis.hazard_class NOT NULL,
        severity            gis.hazard_severity NOT NULL,
        probability_pct     SMALLINT        NULL        -- 0–100 annual probability
                            CHECK (probability_pct BETWEEN 0 AND 100),
        return_period_years INTEGER         NULL,       -- e.g. 100-year flood
        affected_population INTEGER         NULL,
        area_ha             NUMERIC(12, 2)  NULL,       -- pre-computed area in hectares
        administrative_code VARCHAR(20)     NULL,       -- oblast/rayon/jamoat code
        description         TEXT            NULL,
        metadata            JSONB           NOT NULL DEFAULT '{}',
        valid_from          DATE            NULL,
        valid_to            DATE            NULL,
        source_analysis_id  UUID            NULL,       -- FK to future analytics.analyses
        classification      SMALLINT        NOT NULL DEFAULT 0
                            CHECK (classification BETWEEN 0 AND 3),
        created_by_id       UUID            NOT NULL,
        created_at          TIMESTAMPTZ     NOT NULL DEFAULT now(),
        updated_at          TIMESTAMPTZ     NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`
      CREATE INDEX idx_hazard_zones_class      ON gis.hazard_zones (hazard_class);
      CREATE INDEX idx_hazard_zones_severity   ON gis.hazard_zones (severity);
      CREATE INDEX idx_hazard_zones_admin_code ON gis.hazard_zones (administrative_code)
        WHERE administrative_code IS NOT NULL;
      CREATE INDEX idx_hazard_zones_valid      ON gis.hazard_zones (valid_from, valid_to)
        WHERE valid_to IS NULL;
    `);

    // ── administrative_boundaries ─────────────────────────────────────────
    // Tajikistan administrative hierarchy: Oblast → Rayon → Jamoat → Village
    await queryRunner.query(`
      CREATE TYPE gis.admin_level AS ENUM (
        'country', 'oblast', 'rayon', 'jamoat', 'village'
      )
    `);
    await queryRunner.query(`
      CREATE TABLE gis.administrative_boundaries (
        id              UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
        code            VARCHAR(20)     NOT NULL UNIQUE,  -- ISO/national code
        name_local      VARCHAR(200)    NOT NULL,         -- Tajik name
        name_ru         VARCHAR(200)    NULL,             -- Russian name
        name_en         VARCHAR(200)    NULL,             -- English name
        admin_level     gis.admin_level NOT NULL,
        parent_id       UUID            NULL REFERENCES gis.administrative_boundaries(id),
        geometry        geometry(MultiPolygon, 4326) NOT NULL,
        geometry_utm    geometry(MultiPolygon, 32639) GENERATED ALWAYS AS (
                          ST_Transform(geometry, 32639)
                        ) STORED,
        area_km2        NUMERIC(10, 2)  NULL,
        population      INTEGER         NULL,
        centroid        geometry(Point, 4326) GENERATED ALWAYS AS (
                          ST_Centroid(geometry)
                        ) STORED,
        metadata        JSONB           NOT NULL DEFAULT '{}',
        created_at      TIMESTAMPTZ     NOT NULL DEFAULT now(),
        updated_at      TIMESTAMPTZ     NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`
      CREATE INDEX idx_admin_boundaries_level   ON gis.administrative_boundaries (admin_level);
      CREATE INDEX idx_admin_boundaries_parent  ON gis.administrative_boundaries (parent_id);
      CREATE INDEX idx_admin_boundaries_code    ON gis.administrative_boundaries (code);
      CREATE INDEX idx_admin_boundaries_geom    ON gis.administrative_boundaries USING GIST (geometry);
      CREATE INDEX idx_admin_boundaries_centroid ON gis.administrative_boundaries USING GIST (centroid);
    `);

    // ── incident_locations ────────────────────────────────────────────────
    // Spatial record for each emergency incident (links to future analytics.incidents).
    await queryRunner.query(`
      CREATE TABLE gis.incident_locations (
        id                    UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
        incident_ref          VARCHAR(100)    NOT NULL,   -- external incident ID / reference number
        title                 VARCHAR(300)    NOT NULL,
        incident_type         VARCHAR(100)    NOT NULL,   -- matches hazard_class enum values
        severity              VARCHAR(20)     NOT NULL DEFAULT 'medium',
        location              geometry(Point, 4326) NOT NULL,
        affected_area         geometry(Geometry, 4326) NULL,  -- polygon or NULL if point-only
        administrative_code   VARCHAR(20)     NULL REFERENCES gis.administrative_boundaries(code),
        elevation_m           NUMERIC(7, 1)   NULL,       -- populated on ingestion via DEM lookup
        distance_to_river_m   INTEGER         NULL,
        distance_to_road_m    INTEGER         NULL,
        distance_to_settlement_m INTEGER      NULL,
        attributes            JSONB           NOT NULL DEFAULT '{}',
        classification        SMALLINT        NOT NULL DEFAULT 0
                              CHECK (classification BETWEEN 0 AND 3),
        reported_by_id        UUID            NOT NULL,
        reported_at           TIMESTAMPTZ     NOT NULL DEFAULT now(),
        verified_at           TIMESTAMPTZ     NULL,
        verified_by_id        UUID            NULL,
        resolved_at           TIMESTAMPTZ     NULL,
        created_at            TIMESTAMPTZ     NOT NULL DEFAULT now(),
        updated_at            TIMESTAMPTZ     NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`
      CREATE INDEX idx_incident_locations_geom      ON gis.incident_locations USING GIST (location);
      CREATE INDEX idx_incident_locations_area      ON gis.incident_locations USING GIST (affected_area)
        WHERE affected_area IS NOT NULL;
      CREATE INDEX idx_incident_locations_type      ON gis.incident_locations (incident_type);
      CREATE INDEX idx_incident_locations_severity  ON gis.incident_locations (severity);
      CREATE INDEX idx_incident_locations_admin     ON gis.incident_locations (administrative_code)
        WHERE administrative_code IS NOT NULL;
      CREATE INDEX idx_incident_locations_reported  ON gis.incident_locations (reported_at DESC);
      CREATE INDEX idx_incident_locations_open      ON gis.incident_locations (reported_at)
        WHERE resolved_at IS NULL;
    `);

    // ── Trigger: updated_at ────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION gis.set_updated_at()
      RETURNS TRIGGER LANGUAGE plpgsql AS $$
      BEGIN NEW.updated_at = now(); RETURN NEW; END;
      $$
    `);
    for (const tbl of [
      'spatial_layers',
      'spatial_features',
      'hazard_zones',
      'administrative_boundaries',
      'incident_locations',
    ]) {
      await queryRunner.query(`
        CREATE TRIGGER trg_${tbl}_updated_at
          BEFORE UPDATE ON gis.${tbl}
          FOR EACH ROW EXECUTE FUNCTION gis.set_updated_at()
      `);
    }

    // ── Materialized view: incident summary by admin boundary ─────────────
    await queryRunner.query(`
      CREATE MATERIALIZED VIEW gis.mv_incident_summary_by_region AS
      SELECT
        ab.code,
        ab.name_en,
        ab.admin_level,
        i.incident_type,
        COUNT(*)                                    AS incident_count,
        MAX(i.reported_at)                          AS last_incident_at,
        AVG(EXTRACT(EPOCH FROM (i.resolved_at - i.reported_at)) / 3600)::NUMERIC(10,1)
                                                    AS avg_resolution_hours
      FROM gis.incident_locations i
      JOIN gis.administrative_boundaries ab
        ON i.administrative_code = ab.code
      GROUP BY ab.code, ab.name_en, ab.admin_level, i.incident_type
      WITH NO DATA
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX uq_mv_incident_summary
        ON gis.mv_incident_summary_by_region (code, incident_type);
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP MATERIALIZED VIEW IF EXISTS gis.mv_incident_summary_by_region`);
    await queryRunner.query(`DROP SCHEMA IF EXISTS gis CASCADE`);
  }
}
