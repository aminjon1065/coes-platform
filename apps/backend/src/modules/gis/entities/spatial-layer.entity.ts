import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
  OneToMany,
  type Relation,
} from 'typeorm';
import type { SpatialFeature } from './spatial-feature.entity';

export enum GeometryType {
  POINT              = 'point',
  LINESTRING         = 'linestring',
  POLYGON            = 'polygon',
  MULTIPOINT         = 'multipoint',
  MULTILINESTRING    = 'multilinestring',
  MULTIPOLYGON       = 'multipolygon',
  GEOMETRY_COLLECTION = 'geometry_collection',
  RASTER             = 'raster',
}

export enum UpdateCadence {
  REAL_TIME = 'real_time',
  HOURLY    = 'hourly',
  DAILY     = 'daily',
  WEEKLY    = 'weekly',
  MONTHLY   = 'monthly',
  ON_DEMAND = 'on_demand',
  STATIC    = 'static',
}

export enum LayerStatus {
  ACTIVE     = 'active',
  DRAFT      = 'draft',
  DEPRECATED = 'deprecated',
  ARCHIVED   = 'archived',
}

export enum QualityStatus {
  UNVALIDATED  = 'unvalidated',
  VALID        = 'valid',
  INVALID      = 'invalid',
  NEEDS_REVIEW = 'needs_review',
}

@Entity({ name: 'spatial_layers', schema: 'gis' })
@Index(['status'])
@Index(['geometryType'])
@Index(['classification'])
export class SpatialLayer {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 200 })
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({
    name: 'geometry_type',
    type: 'enum',
    enum: GeometryType,
    enumName: 'geometry_type',
  })
  geometryType: GeometryType;

  @Column({ type: 'int', default: 4326 })
  srid: number;

  /** 0=unrestricted 1=internal 2=confidential 3=secret */
  @Column({ type: 'smallint', default: 0 })
  classification: number;

  @Column({ name: 'owner_position_id', type: 'uuid' })
  ownerPositionId: string;

  @Column({
    name: 'update_cadence',
    type: 'enum',
    enum: UpdateCadence,
    enumName: 'update_cadence',
    default: UpdateCadence.ON_DEMAND,
  })
  updateCadence: UpdateCadence;

  @Column({
    type: 'enum',
    enum: LayerStatus,
    enumName: 'layer_status',
    default: LayerStatus.DRAFT,
  })
  status: LayerStatus;

  @Column({
    name: 'quality_status',
    type: 'enum',
    enum: QualityStatus,
    enumName: 'quality_status',
    default: QualityStatus.UNVALIDATED,
  })
  qualityStatus: QualityStatus;

  @Column({ name: 'last_validated_at', type: 'timestamptz', nullable: true })
  lastValidatedAt: Date | null;

  @Column({ name: 'source_name', length: 300, nullable: true })
  sourceName: string | null;

  @Column({ name: 'source_url', type: 'text', nullable: true })
  sourceUrl: string | null;

  @Column({ type: 'text', array: true, default: '{}' })
  keywords: string[];

  /** Attribute field definitions [{ name, type, required, description }] */
  @Column({ name: 'schema_definition', type: 'jsonb', nullable: true })
  schemaDefinition: object | null;

  /** MapLibre GL style specification for client-side rendering */
  @Column({ type: 'jsonb', nullable: true })
  symbology: object | null;

  @Column({ name: 'feature_count', type: 'int', default: 0 })
  featureCount: number;

  /** Layer bounding box as GeoJSON */
  @Column({ name: 'extent_geojson', type: 'jsonb', nullable: true })
  extentGeojson: object | null;

  @Column({ name: 'retention_days', type: 'int', nullable: true })
  retentionDays: number | null;

  @Column({ name: 'published_at', type: 'timestamptz', nullable: true })
  publishedAt: Date | null;

  @Column({ name: 'deprecated_at', type: 'timestamptz', nullable: true })
  deprecatedAt: Date | null;

  @Column({ name: 'created_by_id', type: 'uuid' })
  createdById: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  @OneToMany('SpatialFeature', 'layer')
  features: Relation<SpatialFeature[]>;
}
