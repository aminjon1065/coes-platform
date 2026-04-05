import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { DocumentType } from './document-type.entity';
import { WorkflowStepDefinition } from './workflow-step-definition.entity';

/**
 * A configured sequence of step definitions that governs the lifecycle
 * of documents of a particular type.
 * Templates are applied when a document is registered.
 */
@Entity({ name: 'workflow_templates', schema: 'edms' })
export class WorkflowTemplate {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 200 })
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ name: 'document_type_id' })
  documentTypeId: string;

  @ManyToOne(() => DocumentType, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'document_type_id' })
  documentType: DocumentType;

  /** Version — allows updating templates without breaking active instances */
  @Column({ default: 1 })
  version: number;

  @Column({ default: true })
  active: boolean;

  @OneToMany(() => WorkflowStepDefinition, (s) => s.template, {
    cascade: true,
    eager: true,
    orderBy: { stepOrder: 'ASC' },
  })
  steps: WorkflowStepDefinition[];

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
