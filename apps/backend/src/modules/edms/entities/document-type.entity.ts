import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

/**
 * Document Type is the behavioral template for a category of documents.
 * It governs numbering series, default classification, deadline policy,
 * whether a resolution is required, and which workflow template to use.
 * Configured by org_admin — not created by regular users.
 */
@Entity({ name: 'document_types', schema: 'edms' })
export class DocumentType {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Human-readable name: "Incoming Correspondence", "Internal Order", etc. */
  @Column({ length: 200 })
  name: string;

  @Column({ type: 'varchar',  name: 'name_ru', length: 200, nullable: true })
  nameRu: string | null;

  @Column({ type: 'varchar',  name: 'name_tg', length: 200, nullable: true })
  nameTg: string | null;

  /**
   * Series code used in registration numbers.
   * e.g. "ВС" → produces "ВС-0147/2026"
   */
  @Index({ unique: true })
  @Column({ name: 'series_code', length: 20 })
  seriesCode: string;

  /** 0=public 1=internal 2=confidential 3=secret */
  @Column({ name: 'default_classification', type: 'smallint', default: 1 })
  defaultClassification: number;

  /** Whether a leadership resolution is required before execution */
  @Column({ name: 'requires_resolution', default: false })
  requiresResolution: boolean;

  /** Whether a workflow approval chain is required */
  @Column({ name: 'requires_approval', default: false })
  requiresApproval: boolean;

  /** Default number of calendar days executors have (null = no default deadline) */
  @Column({ type: 'int',  name: 'default_deadline_days', nullable: true })
  defaultDeadlineDays: number | null;

  /** Retention period in years before archival review */
  @Column({ name: 'retention_years', default: 5 })
  retentionYears: number;

  @Column({ default: true })
  active: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
