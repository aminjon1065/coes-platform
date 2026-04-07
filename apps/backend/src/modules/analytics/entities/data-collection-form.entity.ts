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
import type { FormSubmission } from './form-submission.entity';

export enum FormStatus {
  DRAFT     = 'draft',
  PUBLISHED = 'published',
  ARCHIVED  = 'archived',
}

@Entity({ name: 'data_collection_forms', schema: 'analytics' })
@Index(['status'])
@Index(['incidentType'])
export class DataCollectionForm {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 200 })
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  /** NULL = generic form applicable to any incident type */
  @Column({ type: 'varchar',  name: 'incident_type', length: 100, nullable: true })
  incidentType: string | null;

  @Column({ type: 'int', default: 1 })
  version: number;

  @Column({
    type: 'enum',
    enum: FormStatus,
    enumName: 'form_status',
    default: FormStatus.DRAFT,
  })
  status: FormStatus;

  /**
   * Form field definitions.
   * Schema: [{ name: string, type: 'text'|'number'|'select'|'multiselect'|'date'|'boolean'|'textarea',
   *            label: string, required: boolean, options?: string[], validation?: object }]
   */
  @Column({ type: 'jsonb' })
  fields: object[];

  /** 0=unrestricted 1=internal 2=confidential 3=secret */
  @Column({ type: 'smallint', default: 0 })
  classification: number;

  @Column({ name: 'created_by_id', type: 'uuid' })
  createdById: string;

  @Column({ name: 'published_at', type: 'timestamptz', nullable: true })
  publishedAt: Date | null;

  @Column({ name: 'archived_at', type: 'timestamptz', nullable: true })
  archivedAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  @OneToMany('FormSubmission', 'form')
  submissions: Relation<FormSubmission[]>;
}
