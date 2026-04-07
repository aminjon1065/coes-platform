import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { Department } from './department.entity';

export enum PositionLevel {
  CHAIRMAN = 'chairman',
  DEPUTY_CHAIRMAN = 'deputy_chairman',
  DEPARTMENT_HEAD = 'department_head',
  DEPUTY_HEAD = 'deputy_head',
  DIVISION_HEAD = 'division_head',
  SENIOR_SPECIALIST = 'senior_specialist',
  SPECIALIST = 'specialist',
  ANALYST = 'analyst',
  OPERATOR = 'operator',
  CLERK = 'clerk',
}

/**
 * A Position is an immutable slot in the organizational hierarchy.
 * Users occupy positions — positions are not people.
 * Workflows route to positions, not users.
 */
@Entity({ name: 'positions', schema: 'org' })
@Index(['departmentId', 'level'])
export class Position {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 255 })
  title: string;

  @Column({ type: 'varchar',  name: 'title_ru', length: 255, nullable: true })
  titleRu: string | null;

  @Column({ type: 'varchar',  name: 'title_tg', length: 255, nullable: true })
  titleTg: string | null;

  @Column({
    type: 'enum',
    enum: PositionLevel,
    default: PositionLevel.SPECIALIST,
  })
  level: PositionLevel;

  @Column({ name: 'department_id' })
  departmentId: string;

  @ManyToOne(() => Department, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'department_id' })
  department: Department;

  // The position this one reports to (command chain)
  @Column({ type: 'varchar',  name: 'reports_to_id', nullable: true })
  reportsToId: string | null;

  @ManyToOne(() => Position, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'reports_to_id' })
  reportsTo: Position | null;

  // Can this position assign tasks to subordinates?
  @Column({ name: 'can_assign_tasks', default: false })
  canAssignTasks: boolean;

  // Can this position approve documents?
  @Column({ name: 'can_approve_documents', default: false })
  canApproveDocuments: boolean;

  // Can this position issue resolutions?
  @Column({ name: 'can_issue_resolutions', default: false })
  canIssueResolutions: boolean;

  @Column({ default: true })
  active: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
