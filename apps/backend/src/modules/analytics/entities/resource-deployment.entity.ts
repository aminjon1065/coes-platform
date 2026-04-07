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
import type { Incident } from './incident.entity';

export enum ResourceType {
  PERSONNEL     = 'personnel',
  VEHICLE       = 'vehicle',
  EQUIPMENT     = 'equipment',
  MEDICAL       = 'medical',
  SHELTER       = 'shelter',
  FOOD_WATER    = 'food_water',
  COMMUNICATION = 'communication',
  AERIAL        = 'aerial',
  OTHER         = 'other',
}

@Entity({ name: 'resource_deployments', schema: 'analytics' })
@Index(['incidentId'])
@Index(['resourceType'])
export class ResourceDeployment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'incident_id', type: 'uuid' })
  incidentId: string;

  @ManyToOne('Incident', 'resourceDeployments', { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'incident_id' })
  incident: Relation<Incident>;

  @Column({
    name: 'resource_type',
    type: 'enum',
    enum: ResourceType,
    enumName: 'resource_type',
  })
  resourceType: ResourceType;

  @Column({ name: 'resource_name', length: 200 })
  resourceName: string;

  @Column({ type: 'int', default: 1 })
  quantity: number;

  @Column({ type: 'varchar',  length: 50, nullable: true })
  unit: string | null;

  @Column({ name: 'dept_id', type: 'uuid', nullable: true })
  deptId: string | null;

  @Column({ name: 'deployed_at', type: 'timestamptz', default: () => 'now()' })
  deployedAt: Date;

  /** NULL = still deployed */
  @Column({ name: 'withdrawn_at', type: 'timestamptz', nullable: true })
  withdrawnAt: Date | null;

  @Column({ name: 'cost_estimate', type: 'decimal', precision: 14, scale: 2, nullable: true })
  costEstimate: number | null;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @Column({ name: 'created_by_id', type: 'uuid' })
  createdById: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
