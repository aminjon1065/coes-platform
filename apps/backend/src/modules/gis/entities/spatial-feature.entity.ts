import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
  ManyToOne,
  JoinColumn,
  type Relation,
} from 'typeorm';
import type { SpatialLayer } from './spatial-layer.entity';

@Entity({ name: 'spatial_features', schema: 'gis' })
@Index(['layerId'])
export class SpatialFeature {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'layer_id', type: 'uuid' })
  layerId: string;

  @ManyToOne('SpatialLayer', 'features', { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'layer_id' })
  layer: Relation<SpatialLayer>;

  @Column({ name: 'external_id', length: 200, nullable: true })
  externalId: string | null;

  @Column({ type: 'jsonb', default: '{}' })
  properties: object;

  /** 0=unrestricted 1=internal 2=confidential 3=secret */
  @Column({ type: 'smallint', default: 0 })
  classification: number;

  /**
   * PostGIS geometry column (WGS84 / SRID 4326).
   * Stored and retrieved as GeoJSON text via ST_AsGeoJSON() in service layer.
   * TypeORM maps this as a string; raw spatial queries must use ST_GeomFromGeoJSON().
   */
  @Column({ type: 'geometry', spatialFeatureType: 'Geometry', srid: 4326 })
  geometry: string;

  /**
   * geometry_utm is a GENERATED column in the DB (ST_Transform to EPSG:32639).
   * Not writable from the ORM — read-only for spatial metric queries.
   */

  @Column({ name: 'valid_from', type: 'timestamptz', nullable: true })
  validFrom: Date | null;

  /** NULL = currently valid */
  @Column({ name: 'valid_to', type: 'timestamptz', nullable: true })
  validTo: Date | null;

  @Column({ name: 'source_ref', length: 500, nullable: true })
  sourceRef: string | null;

  @Column({ name: 'created_by_id', type: 'uuid' })
  createdById: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
