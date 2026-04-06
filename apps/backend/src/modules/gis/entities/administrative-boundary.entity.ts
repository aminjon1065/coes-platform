import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
  ManyToOne,
  OneToMany,
  JoinColumn,
} from 'typeorm';

export enum AdminLevel {
  COUNTRY = 'country',
  OBLAST  = 'oblast',
  RAYON   = 'rayon',
  JAMOAT  = 'jamoat',
  VILLAGE = 'village',
}

@Entity({ name: 'administrative_boundaries', schema: 'gis' })
@Index(['adminLevel'])
@Index(['parentId'])
export class AdministrativeBoundary {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** ISO or national administrative code — unique */
  @Column({ length: 20, unique: true })
  code: string;

  @Column({ name: 'name_local', length: 200 })
  nameLocal: string;

  @Column({ name: 'name_ru', length: 200, nullable: true })
  nameRu: string | null;

  @Column({ name: 'name_en', length: 200, nullable: true })
  nameEn: string | null;

  @Column({
    name: 'admin_level',
    type: 'enum',
    enum: AdminLevel,
    enumName: 'admin_level',
  })
  adminLevel: AdminLevel;

  @Column({ name: 'parent_id', type: 'uuid', nullable: true })
  parentId: string | null;

  @ManyToOne(() => AdministrativeBoundary, (b) => b.children, { nullable: true })
  @JoinColumn({ name: 'parent_id' })
  parent: AdministrativeBoundary | null;

  @OneToMany(() => AdministrativeBoundary, (b) => b.parent)
  children: AdministrativeBoundary[];

  /**
   * MultiPolygon geometry (WGS84).
   * Stored as PostGIS geometry(MultiPolygon, 4326).
   * geometry_utm and centroid are GENERATED columns in the DB — not mapped here.
   */
  @Column({ type: 'geometry', spatialFeatureType: 'MultiPolygon', srid: 4326 })
  geometry: string;

  @Column({ name: 'area_km2', type: 'decimal', precision: 10, scale: 2, nullable: true })
  areaKm2: number | null;

  @Column({ type: 'int', nullable: true })
  population: number | null;

  @Column({ type: 'jsonb', default: '{}' })
  metadata: object;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
