import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

/**
 * Immutable snapshot of a message's content before each edit.
 * Original content is never destroyed — preserved for audit.
 */
@Entity({ name: 'message_edits', schema: 'chat' })
@Index(['messageId', 'createdAt'])
export class MessageEdit {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'message_id' })
  messageId: string;

  /** Content before this edit */
  @Column({ name: 'previous_body', type: 'text', nullable: true })
  previousBody: string | null;

  @Column({ name: 'previous_attachments', type: 'jsonb', default: '[]' })
  previousAttachments: unknown[];

  @Column({ name: 'edited_by_id' })
  editedById: string;

  @Column({ name: 'edit_reason', length: 300, nullable: true })
  editReason: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
