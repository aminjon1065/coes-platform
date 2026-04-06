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
import type { DataCollectionForm } from './data-collection-form.entity';

export enum SubmissionStatus {
  SUBMITTED         = 'submitted',
  UNDER_REVIEW      = 'under_review',
  ACCEPTED          = 'accepted',
  REJECTED          = 'rejected',
  REQUIRES_REVISION = 'requires_revision',
}

@Entity({ name: 'form_submissions', schema: 'analytics' })
@Index(['formId'])
@Index(['incidentId'])
@Index(['status'])
@Index(['submittedAt'])
export class FormSubmission {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'form_id', type: 'uuid' })
  formId: string;

  @ManyToOne('DataCollectionForm', 'submissions')
  @JoinColumn({ name: 'form_id' })
  form: Relation<DataCollectionForm>;

  @Column({ name: 'incident_id', type: 'uuid', nullable: true })
  incidentId: string | null;

  /** Fallback ref if incident not yet formally registered */
  @Column({ name: 'incident_ref', length: 100, nullable: true })
  incidentRef: string | null;

  @Column({
    type: 'enum',
    enum: SubmissionStatus,
    enumName: 'submission_status',
    default: SubmissionStatus.SUBMITTED,
  })
  status: SubmissionStatus;

  /** Field values keyed by field name */
  @Column({ type: 'jsonb' })
  data: object;

  @Column({ name: 'location_lat', type: 'decimal', precision: 10, scale: 7, nullable: true })
  locationLat: number | null;

  @Column({ name: 'location_lon', type: 'decimal', precision: 10, scale: 7, nullable: true })
  locationLon: number | null;

  @Column({ name: 'submitted_by_id', type: 'uuid' })
  submittedById: string;

  @Column({ name: 'reviewed_by_id', type: 'uuid', nullable: true })
  reviewedById: string | null;

  @Column({ name: 'review_notes', type: 'text', nullable: true })
  reviewNotes: string | null;

  @Column({ name: 'submitted_at', type: 'timestamptz', default: () => 'now()' })
  submittedAt: Date;

  @Column({ name: 'reviewed_at', type: 'timestamptz', nullable: true })
  reviewedAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
