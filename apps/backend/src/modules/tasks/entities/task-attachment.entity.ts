import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
  ManyToOne,
  JoinColumn,
  type Relation,
} from 'typeorm';
import type { Task } from './task.entity';

/**
 * Reference to a file stored in the FileManagement domain.
 * Task Management stores the reference only — never file bytes.
 */
@Entity({ name: 'task_attachments', schema: 'tasks' })
@Index(['taskId'])
export class TaskAttachment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'task_id' })
  taskId: string;

  @ManyToOne('Task', 'attachments', { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'task_id' })
  task: Relation<Task>;

  /** Reference to file in FileManagement domain */
  @Column({ name: 'file_id' })
  fileId: string;

  /** Display name (denormalized for performance) */
  @Column({ name: 'file_name', length: 500 })
  fileName: string;

  @Column({ name: 'mime_type', length: 100, nullable: true })
  mimeType: string | null;

  @Column({ name: 'file_size_bytes', type: 'bigint', nullable: true })
  fileSizeBytes: number | null;

  @Column({ name: 'uploader_id' })
  uploaderId: string;

  @Column({ name: 'uploader_position_id', nullable: true })
  uploaderPositionId: string | null;

  /** Classification of this attachment (may exceed task classification) */
  @Column({ name: 'classification', default: 1 })
  classification: number;

  /** Soft-delete: set when attachment is removed */
  @Column({ name: 'removed_at', type: 'timestamptz', nullable: true })
  removedAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
