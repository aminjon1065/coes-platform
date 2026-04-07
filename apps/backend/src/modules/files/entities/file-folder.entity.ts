import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
  ManyToOne,
  OneToMany,
  JoinColumn,
} from 'typeorm';

@Entity({ name: 'file_folders', schema: 'files' })
@Index(['parentId'])
@Index(['ownerPositionId'])
export class FileFolder {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 255 })
  name: string;

  @Column({ name: 'parent_id', type: 'uuid', nullable: true })
  parentId: string | null;

  @ManyToOne(() => FileFolder, (f) => f.children, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'parent_id' })
  parent: FileFolder | null;

  @OneToMany(() => FileFolder, (f) => f.parent)
  children: FileFolder[];

  @Column({ name: 'owner_position_id', type: 'uuid' })
  ownerPositionId: string;

  @Column({ type: 'smallint', default: 1 })
  classification: number;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ name: 'created_by_id', type: 'uuid' })
  createdById: string;

  @Column({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
