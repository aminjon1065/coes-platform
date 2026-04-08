import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, TreeRepository } from 'typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';

import { Department } from '../entities/department.entity';
import { Position } from '../entities/position.entity';
import { OrgChangeHistory, OrgChangeType } from '../entities/org-change-history.entity';
import { CreateDepartmentDto } from '../dto/create-department.dto';
import { CreatePositionDto } from '../dto/create-position.dto';

@Injectable()
export class OrgService {
  constructor(
    @InjectRepository(Department)
    private readonly deptRepo: TreeRepository<Department>,
    @InjectRepository(Position)
    private readonly positionRepo: Repository<Position>,
    @InjectRepository(OrgChangeHistory)
    private readonly historyRepo: Repository<OrgChangeHistory>,
    private readonly events: EventEmitter2,
  ) {}

  // ───────────────────────────── Departments ──────────────────────────────

  async createDepartment(dto: CreateDepartmentDto, requestedBy?: string): Promise<Department> {
    let parent: Department | null = null;

    if (dto.parentId) {
      parent = await this.deptRepo.findOne({ where: { id: dto.parentId, active: true } });
      if (!parent) {
        throw new NotFoundException(`Parent department ${dto.parentId} not found`);
      }
    }

    const dept = this.deptRepo.create({
      name: dto.name,
      nameRu: dto.nameRu ?? null,
      nameTg: dto.nameTg ?? null,
      shortCode: dto.shortCode ?? null,
      parentId: dto.parentId ?? null,
      parent,
      sortOrder: dto.sortOrder ?? 0,
    });

    const saved = await this.deptRepo.save(dept);

    await this.recordChange({
      changeType: OrgChangeType.DEPARTMENT_CREATED,
      entityType: 'department',
      entityId: saved.id,
      changedById: requestedBy ?? null,
      after: saved as unknown as Record<string, unknown>,
    });

    this.events.emit('org.department.created', { departmentId: saved.id });

    return saved;
  }

  async getDepartmentTree(): Promise<Department[]> {
    return this.deptRepo.findTrees({ relations: ['children'] });
  }

  async getDepartmentById(id: string): Promise<Department> {
    const dept = await this.deptRepo.findOne({ where: { id } });
    if (!dept) throw new NotFoundException(`Department ${id} not found`);
    return dept;
  }

  async getDescendants(departmentId: string): Promise<Department[]> {
    const root = await this.getDepartmentById(departmentId);
    const tree = await this.deptRepo.findDescendantsTree(root);
    return this.flattenTree(tree);
  }

  async deactivateDepartment(id: string, requestedBy?: string): Promise<void> {
    const dept = await this.getDepartmentById(id);

    const before = { ...dept } as unknown as Record<string, unknown>;
    await this.deptRepo.update(id, { active: false });

    await this.recordChange({
      changeType: OrgChangeType.DEPARTMENT_DEACTIVATED,
      entityType: 'department',
      entityId: id,
      changedById: requestedBy ?? null,
      before,
      after: { ...before, active: false },
    });

    this.events.emit('org.department.deactivated', {
      departmentId: id,
      requestedBy: requestedBy ?? null,
    });
  }

  // ─────────────────────────────── Positions ──────────────────────────────

  async createPosition(dto: CreatePositionDto, requestedBy?: string): Promise<Position> {
    const dept = await this.deptRepo.findOne({ where: { id: dto.departmentId, active: true } });
    if (!dept) throw new NotFoundException(`Department ${dto.departmentId} not found`);

    if (dto.reportsToId) {
      const reportsTo = await this.positionRepo.findOne({ where: { id: dto.reportsToId } });
      if (!reportsTo) throw new NotFoundException(`Position ${dto.reportsToId} not found`);
    }

    const position = this.positionRepo.create({
      title: dto.title,
      titleRu: dto.titleRu ?? null,
      titleTg: dto.titleTg ?? null,
      level: dto.level,
      departmentId: dto.departmentId,
      reportsToId: dto.reportsToId ?? null,
      canAssignTasks: dto.canAssignTasks ?? false,
      canApproveDocuments: dto.canApproveDocuments ?? false,
      canIssueResolutions: dto.canIssueResolutions ?? false,
    });

    const saved = await this.positionRepo.save(position);

    await this.recordChange({
      changeType: OrgChangeType.POSITION_CREATED,
      entityType: 'position',
      entityId: saved.id,
      changedById: requestedBy ?? null,
      after: saved as unknown as Record<string, unknown>,
    });

    this.events.emit('org.position.created', { positionId: saved.id, departmentId: saved.departmentId });

    return saved;
  }

  async getPositionById(id: string): Promise<Position> {
    const pos = await this.positionRepo.findOne({ where: { id }, relations: ['department', 'reportsTo'] });
    if (!pos) throw new NotFoundException(`Position ${id} not found`);
    return pos;
  }

  async getAllActivePositions(): Promise<Position[]> {
    return this.positionRepo.find({
      where: { active: true },
      relations: ['department', 'reportsTo'],
      order: { level: 'ASC', title: 'ASC' },
    });
  }

  async getPositionsByDepartment(departmentId: string): Promise<Position[]> {
    return this.positionRepo.find({
      where: { departmentId, active: true },
      relations: ['department', 'reportsTo'],
      order: { level: 'ASC' },
    });
  }

  async getCommandChain(positionId: string): Promise<Position[]> {
    const chain: Position[] = [];
    let current = await this.positionRepo.findOne({
      where: { id: positionId },
      relations: ['reportsTo'],
    });

    while (current) {
      chain.push(current);
      if (!current.reportsToId) break;
      current = await this.positionRepo.findOne({
        where: { id: current.reportsToId },
        relations: ['reportsTo'],
      });
    }

    return chain;
  }

  async isSubordinateTo(subordinateId: string, supervisorId: string): Promise<boolean> {
    const chain = await this.getCommandChain(subordinateId);
    return chain.some((p) => p.id === supervisorId);
  }

  // ─────────────────────────────── History ────────────────────────────────

  private async recordChange(data: {
    changeType: OrgChangeType;
    entityType: string;
    entityId: string;
    changedById: string | null;
    before?: Record<string, unknown>;
    after?: Record<string, unknown>;
  }): Promise<void> {
    await this.historyRepo.save(
      this.historyRepo.create({
        changeType: data.changeType,
        entityType: data.entityType,
        entityId: data.entityId,
        changedById: data.changedById,
        before: data.before ?? null,
        after: data.after ?? null,
      }),
    );
  }

  private flattenTree(node: Department): Department[] {
    const result: Department[] = [node];
    for (const child of node.children ?? []) {
      result.push(...this.flattenTree(child));
    }
    return result;
  }
}
