import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

@Entity({ name: 'incident_locations', schema: 'gis' })
@Index(['incidentType'])
@Index(['severity'])
@Index(['administrativeCode'])
@Index(['reportedAt'])
export class IncidentLocation {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** External incident identifier / document number */
  @Column({ name: 'incident_ref', length: 100 })
  incidentRef: string;

  @Column({ length: 300 })
  title: string;

  /** Matches HazardClass values; stored as varchar for flexibility */
  @Column({ name: 'incident_type', length: 100 })
  incidentType: string;

  @Column({ length: 20, default: 'medium' })
  severity: string;

  /**
   * Point location of the incident (WGS84).
   * Stored as PostGIS geometry; read via ST_AsGeoJSON() in service.
   */
  @Column({ type: 'geometry', spatialFeatureType: 'Point', srid: 4326 })
  location: string;

  /**
   * Optional affected area polygon or multi-polygon.
   * NULL for point-only incidents.
   */
  @Column({
    name: 'affected_area',
    type: 'geometry',
    spatialFeatureType: 'Geometry',
    srid: 4326,
    nullable: true,
  })
  affectedArea: string | null;

  /** FK to gis.administrative_boundaries.code */
  @Column({ type: 'varchar',  name: 'administrative_code', length: 20, nullable: true })
  administrativeCode: string | null;

  /** Elevation above sea level in metres — populated via DEM lookup on ingest */
  @Column({ name: 'elevation_m', type: 'decimal', precision: 7, scale: 1, nullable: true })
  elevationM: number | null;

  /** Distance to nearest river in metres — populated on ingest */
  @Column({ name: 'distance_to_river_m', type: 'int', nullable: true })
  distanceToRiverM: number | null;

  /** Distance to nearest road in metres — populated on ingest */
  @Column({ name: 'distance_to_road_m', type: 'int', nullable: true })
  distanceToRoadM: number | null;

  /** Distance to nearest settlement in metres — populated on ingest */
  @Column({ name: 'distance_to_settlement_m', type: 'int', nullable: true })
  distanceToSettlementM: number | null;

  /** Domain-specific attributes (e.g. affected_area_ha, casualties, resource_requirements) */
  @Column({ type: 'jsonb', default: '{}' })
  attributes: object;

  /** 0=unrestricted 1=internal 2=confidential 3=secret */
  @Column({ type: 'smallint', default: 0 })
  classification: number;

  @Column({ name: 'reported_by_id', type: 'uuid' })
  reportedById: string;

  @Column({ name: 'reported_at', type: 'timestamptz', default: () => 'now()' })
  reportedAt: Date;

  @Column({ name: 'verified_at', type: 'timestamptz', nullable: true })
  verifiedAt: Date | null;

  @Column({ name: 'verified_by_id', type: 'uuid', nullable: true })
  verifiedById: string | null;

  /** NULL = incident still open */
  @Column({ name: 'resolved_at', type: 'timestamptz', nullable: true })
  resolvedAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
