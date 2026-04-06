import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  Index,
  Unique,
  ManyToOne,
  JoinColumn,
  type Relation,
} from 'typeorm';
import type { FileRecord } from './file-record.entity';

export enum LinkedEntityType {
  TASK     = 'task',
  DOCUMENT = 'document',
  MESSAGE  = 'message',
  CHANNEL  = 'channel',
}

@Entity({ name: 'file_links', schema: 'files' })
@Unique(['fileId', 'linkedEntityId', 'linkedEntityType'])
@Index(['linkedEntityId', 'linkedEntityType'])
@Index(['fileId'])
export class FileLink {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'file_id' })
  fileId: string;

  @ManyToOne('FileRecord', 'links', { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'file_id' })
  file: Relation<FileRecord>;

  @Column({ name: 'linked_entity_id' })
  linkedEntityId: string;

  @Column({ name: 'linked_entity_type', type: 'enum', enum: LinkedEntityType })
  linkedEntityType: LinkedEntityType;

  @Column({ name: 'linked_by_id' })
  linkedById: string;

  @Column({ name: 'linked_at', type: 'timestamptz', default: () => 'NOW()' })
  linkedAt: Date;
}
