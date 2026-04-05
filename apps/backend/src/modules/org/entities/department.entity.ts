import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  OneToMany,
  JoinColumn,
  Index,
  Tree,
  TreeChildren,
  TreeParent,
} from 'typeorm';

@Entity({ name: 'departments', schema: 'org' })
@Tree('closure-table', { closureTableName: 'department_closure', ancestorColumnName: () => 'ancestor_id', descendantColumnName: () => 'descendant_id' })
export class Department {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 255 })
  name: string;

  @Column({ name: 'name_ru', length: 255, nullable: true })
  nameRu: string | null;

  @Column({ name: 'name_tg', length: 255, nullable: true })
  nameTg: string | null;

  @Column({ name: 'short_code', length: 20, nullable: true })
  shortCode: string | null;

  @Column({ name: 'parent_id', nullable: true })
  parentId: string | null;

  @TreeParent()
  @JoinColumn({ name: 'parent_id' })
  parent: Department | null;

  @TreeChildren()
  children: Department[];

  @Column({ default: true })
  active: boolean;

  @Column({ name: 'sort_order', default: 0 })
  sortOrder: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
