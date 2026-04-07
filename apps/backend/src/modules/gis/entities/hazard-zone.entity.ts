import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { SpatialFeature } from './spatial-feature.entity';

export enum HazardClass {
  FLOOD       = 'flood',
  LANDSLIDE   = 'landslide',
  SEISMIC     = 'seismic',
  WILDFIRE    = 'wildfire',
  AVALANCHE   = 'avalanche',
  DROUGHT     = 'drought',
  INDUSTRIAL  = 'industrial',
  BIOLOGICAL  = 'biological',
  COMPOUND    = 'compound',
}

export enum HazardSeverity {
  LOW      = 'low',
  MEDIUM   = 'medium',
  HIGH     = 'high',
  CRITICAL = 'critical',
}

@Entity({ name: 'hazard_zones', schema: 'gis' })
@Index(['hazardClass'])
@Index(['severity'])
@Index(['administrativeCode'])
export class HazardZone {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'feature_id', type: 'uuid' })
  featureId: string;

  @ManyToOne(() => SpatialFeature, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'feature_id' })
  feature: SpatialFeature;

  @Column({
    name: 'hazard_class',
    type: 'enum',
    enum: HazardClass,
    enumName: 'hazard_class',
  })
  hazardClass: HazardClass;

  @Column({
    type: 'enum',
    enum: HazardSeverity,
    enumName: 'hazard_severity',
  })
  severity: HazardSeverity;

  /** Annual probability percentage (0–100) */
  @Column({ name: 'probability_pct', type: 'smallint', nullable: true })
  probabilityPct: number | null;

  /** Return period in years (e.g. 100 for a 100-year flood) */
  @Column({ name: 'return_period_years', type: 'int', nullable: true })
  returnPeriodYears: number | null;

  @Column({ name: 'affected_population', type: 'int', nullable: true })
  affectedPopulation: number | null;

  /** Pre-computed area in hectares */
  @Column({ name: 'area_ha', type: 'decimal', precision: 12, scale: 2, nullable: true })
  areaHa: number | null;

  /** Oblast/Rayon/Jamoat administrative code */
  @Column({ type: 'varchar',  name: 'administrative_code', length: 20, nullable: true })
  administrativeCode: string | null;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ type: 'jsonb', default: '{}' })
  metadata: object;

  @Column({ name: 'valid_from', type: 'date', nullable: true })
  validFrom: Date | null;

  /** NULL = currently active */
  @Column({ name: 'valid_to', type: 'date', nullable: true })
  validTo: Date | null;

  /** FK to future analytics.analyses */
  @Column({ name: 'source_analysis_id', type: 'uuid', nullable: true })
  sourceAnalysisId: string | null;

  /** 0=unrestricted 1=internal 2=confidential 3=secret */
  @Column({ type: 'smallint', default: 0 })
  classification: number;

  @Column({ name: 'created_by_id', type: 'uuid' })
  createdById: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
