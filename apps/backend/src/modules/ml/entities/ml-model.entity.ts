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
import type { MlModelVersion } from './ml-model-version.entity';

export enum HazardType {
  FLOOD     = 'flood',
  LANDSLIDE = 'landslide',
  SEISMIC   = 'seismic',
  WILDFIRE  = 'wildfire',
}

export enum ModelFramework {
  XGBOOST   = 'xgboost',
  LIGHTGBM  = 'lightgbm',
  SKLEARN   = 'sklearn',
  PYTORCH   = 'pytorch',
}

@Entity({ name: 'ml_models', schema: 'ml' })
@Index(['hazardType'])
@Index(['isActive'])
export class MlModel {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Stable slug used in MLflow experiment names: e.g. "flood-risk-v2" */
  @Column({ length: 120, unique: true })
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({
    name: 'hazard_type',
    type: 'enum',
    enum: HazardType,
    enumName: 'hazard_type',
  })
  hazardType: HazardType;

  @Column({
    type: 'enum',
    enum: ModelFramework,
    enumName: 'model_framework',
    default: ModelFramework.XGBOOST,
  })
  framework: ModelFramework;

  /** Feature columns expected by this model */
  @Column({ name: 'feature_names', type: 'jsonb', default: '[]' })
  featureNames: string[];

  /** Optional preprocessing schema (scaler params, encoding maps) */
  @Column({ name: 'preprocessing_config', type: 'jsonb', default: '{}' })
  preprocessingConfig: object;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  /** 0=unrestricted 1=internal 2=confidential 3=secret */
  @Column({ type: 'smallint', default: 1 })
  classification: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  @OneToMany('MlModelVersion', 'model')
  versions: Relation<MlModelVersion[]>;
}
