import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

export enum FeatureValueType {
  FLOAT    = 'float',
  INTEGER  = 'integer',
  BOOLEAN  = 'boolean',
  CATEGORY = 'category',
}

export enum FeatureSourceDomain {
  GIS       = 'gis',
  ANALYTICS = 'analytics',
  WEATHER   = 'weather',
  DERIVED   = 'derived',
}

@Entity({ name: 'feature_definitions', schema: 'ml' })
@Index(['name'], { unique: true })
@Index(['sourceDomain'])
export class FeatureDefinition {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Machine-readable key: "precipitation_7d_mm", "slope_mean_deg", etc. */
  @Column({ length: 120, unique: true })
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({
    name: 'value_type',
    type: 'enum',
    enum: FeatureValueType,
    enumName: 'feature_value_type',
    default: FeatureValueType.FLOAT,
  })
  valueType: FeatureValueType;

  @Column({
    name: 'source_domain',
    type: 'enum',
    enum: FeatureSourceDomain,
    enumName: 'feature_source_domain',
  })
  sourceDomain: FeatureSourceDomain;

  /** SQL or DAG task that computes this feature */
  @Column({ name: 'computation_spec', type: 'jsonb', default: '{}' })
  computationSpec: object;

  /** Expected value range for validation: { min: 0, max: 500 } */
  @Column({ name: 'valid_range', type: 'jsonb', nullable: true })
  validRange: { min: number; max: number } | null;

  /** Possible category values (only when value_type = category) */
  @Column({ name: 'categories', type: 'jsonb', nullable: true })
  categories: string[] | null;

  /** Expected freshness TTL in seconds */
  @Column({ name: 'ttl_seconds', type: 'int', nullable: true })
  ttlSeconds: number | null;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
