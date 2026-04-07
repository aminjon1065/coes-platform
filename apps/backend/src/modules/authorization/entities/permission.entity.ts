import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

/**
 * Fine-grained capability definition.
 * Format: <domain>.<resource>.<action>
 * Examples: iam.user.create, edms.document.approve, tasks.task.assign
 */
@Entity({ name: 'permissions', schema: 'authz' })
export class Permission {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index({ unique: true })
  @Column({ length: 150 })
  name: string; // e.g. "edms.document.approve"

  @Column({ length: 50 })
  domain: string; // e.g. "edms"

  @Column({ length: 50 })
  resource: string; // e.g. "document"

  @Column({ length: 50 })
  action: string; // e.g. "approve"

  @Column({ type: 'varchar',  length: 500, nullable: true })
  description: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
