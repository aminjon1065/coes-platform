import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, TreeRepository, In, IsNull } from 'typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';

import { Department } from '../entities/department.entity';
import { Position } from '../entities/position.entity';
import { OrgChangeHistory, OrgChangeType } from '../entities/org-change-history.entity';
import { CreateDepartmentDto } from '../dto/create-department.dto';
import { CreatePositionDto } from '../dto/create-position.dto';
import { UserPositionAssignment } from '../../users/entities/user-position-assignment.entity';
import { AuditService } from '../../audit/services/audit.service';
import { AuditSeverity } from '../../audit/entities/audit-event.entity';

@Injectable()
export class OrgService {
  constructor(
    @InjectRepository(Department)
    private readonly deptRepo: TreeRepository<Department>,
    @InjectRepository(Position)
    private readonly positionRepo: Repository<Position>,
    @InjectRepository(OrgChangeHistory)
    private readonly historyRepo: Repository<OrgChangeHistory>,
    @InjectRepository(UserPositionAssignment)
    private readonly userPositionAssignmentRepo: Repository<UserPositionAssignment>,
    private readonly auditService: AuditService,
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
    await this.auditService.emit({
      actorId: requestedBy,
      eventType: 'admin.department.created',
      resourceType: 'department',
      resourceId: saved.id,
      success: true,
      severity: AuditSeverity.INFO,
      metadata: {
        name: saved.name,
        parentDepartmentId: saved.parentId,
      },
    });

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
    await this.auditService.emit({
      actorId: requestedBy,
      eventType: 'admin.department.deactivated',
      resourceType: 'department',
      resourceId: id,
      success: true,
      severity: AuditSeverity.WARNING,
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
    await this.auditService.emit({
      actorId: requestedBy,
      eventType: 'admin.position.created',
      resourceType: 'position',
      resourceId: saved.id,
      success: true,
      severity: AuditSeverity.INFO,
      metadata: {
        title: saved.title,
        departmentId: saved.departmentId,
        reportsToId: saved.reportsToId,
      },
    });

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

  async getDepartmentAdminSummary() {
    const tree = await this.getDepartmentTree();
    const positions = await this.getAllActivePositions();
    const assignments = await this.userPositionAssignmentRepo.find({
      where: { vacatedAt: IsNull() },
    });

    const occupiedPositionIds = new Set(assignments.map((assignment) => assignment.positionId));
    const usersByPositionId = new Map<string, Set<string>>();
    for (const assignment of assignments) {
      const current = usersByPositionId.get(assignment.positionId) ?? new Set<string>();
      current.add(assignment.userId);
      usersByPositionId.set(assignment.positionId, current);
    }

    const collectIds = (node: Department): string[] => [
      node.id,
      ...(node.children ?? []).flatMap((child) => collectIds(child)),
    ];

    const enrichTree = (nodes: Department[]): Array<Record<string, unknown>> =>
      nodes.map((node) => {
        const subtreeIds = new Set(collectIds(node));
        const subtreePositions = positions.filter((position) => subtreeIds.has(position.departmentId));
        const occupiedCount = subtreePositions.filter((position) => occupiedPositionIds.has(position.id)).length;
        const userIds = new Set(
          subtreePositions.flatMap((position) => [...(usersByPositionId.get(position.id) ?? new Set<string>())]),
        );

        return {
          id: node.id,
          name: node.name,
          code: node.shortCode,
          isActive: node.active,
          parentDepartmentId: node.parentId,
          metrics: {
            positionCount: subtreePositions.length,
            occupiedCount,
            vacantCount: subtreePositions.length - occupiedCount,
            userCount: userIds.size,
          },
          children: enrichTree(node.children ?? []),
        };
      });

    return {
      items: enrichTree(tree),
    };
  }

  async getPositionAdminRegistry() {
    const positions = await this.positionRepo.find({
      where: { active: true },
      relations: ['department', 'reportsTo'],
      order: { level: 'ASC', title: 'ASC' },
    });
    const assignments = await this.userPositionAssignmentRepo.find({
      where: positions.length ? { positionId: In(positions.map((position) => position.id)) } : undefined,
      relations: ['user'],
      order: { assignedAt: 'DESC' },
    });

    const assignmentsByPositionId = new Map<string, UserPositionAssignment[]>();
    const occupantByPositionId = new Map<string, UserPositionAssignment>();

    for (const assignment of assignments) {
      const current = assignmentsByPositionId.get(assignment.positionId) ?? [];
      current.push(assignment);
      assignmentsByPositionId.set(assignment.positionId, current);

      if (!assignment.vacatedAt && assignment.type === 'primary' && !occupantByPositionId.has(assignment.positionId)) {
        occupantByPositionId.set(assignment.positionId, assignment);
      }
    }

    const positionById = new Map(positions.map((position) => [position.id, position]));
    const buildChain = (position: Position) => {
      const chain: Position[] = [];
      let current: Position | null = position;

      while (current) {
        chain.push(current);
        current = current.reportsToId ? positionById.get(current.reportsToId) ?? null : null;
      }

      return chain;
    };

    return {
      items: positions.map((position) => {
        const occupantAssignment = occupantByPositionId.get(position.id);
        const history = assignmentsByPositionId.get(position.id) ?? [];

        return {
          id: position.id,
          title: position.title,
          level: position.level,
          departmentId: position.departmentId,
          departmentName: position.department?.name ?? null,
          reportsToId: position.reportsToId,
          isActive: position.active,
          canAssignTasks: position.canAssignTasks,
          canApproveDocuments: position.canApproveDocuments,
          canIssueResolutions: position.canIssueResolutions,
          occupant: occupantAssignment?.user
            ? {
                id: occupantAssignment.user.id,
                credentialId: occupantAssignment.user.credentialId,
                displayName:
                  occupantAssignment.user.displayName ||
                  [occupantAssignment.user.firstName, occupantAssignment.user.lastName].filter(Boolean).join(' ') ||
                  occupantAssignment.user.email,
                email: occupantAssignment.user.email,
                status: occupantAssignment.user.status,
              }
            : null,
          commandChain: buildChain(position).map((item) => ({
            id: item.id,
            title: item.title,
            level: item.level,
            departmentId: item.departmentId,
            departmentName: item.department?.name ?? null,
            reportsToId: item.reportsToId,
            isActive: item.active,
            canAssignTasks: item.canAssignTasks,
            canApproveDocuments: item.canApproveDocuments,
            canIssueResolutions: item.canIssueResolutions,
          })),
          history: history.map((assignment) => ({
            id: assignment.id,
            userId: assignment.userId,
            positionId: assignment.positionId,
            type: assignment.type,
            assignedAt: assignment.assignedAt,
            vacatedAt: assignment.vacatedAt,
            assignedById: assignment.assignedById,
            vacatedById: assignment.vacatedById,
            notes: assignment.notes,
          })),
        };
      }),
    };
  }
}
