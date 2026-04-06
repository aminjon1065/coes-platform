import {
  Injectable,
  Logger,
  ForbiddenException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull } from 'typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';

import { Role } from '../entities/role.entity';
import { UserRoleAssignment } from '../entities/user-role-assignment.entity';
import { AuthorizationService } from './authorization.service';
import { GrantDeptRoleDto, RevokeDeptRoleDto } from '../dto/delegated-admin.dto';

/** Permission required to act as a department admin */
const DEPT_ADMIN_PERMISSION = 'dept:admin';

@Injectable()
export class DelegatedAdminService {
  private readonly logger = new Logger(DelegatedAdminService.name);

  constructor(
    @InjectRepository(Role)
    private readonly roleRepo: Repository<Role>,
    @InjectRepository(UserRoleAssignment)
    private readonly assignmentRepo: Repository<UserRoleAssignment>,
    private readonly authzService: AuthorizationService,
    private readonly events: EventEmitter2,
  ) {}

  // ── Guard ────────────────────────────────────────────────────────────────────

  /**
   * Assert that the calling user has department-admin capability for the given dept.
   * Throws ForbiddenException if not.
   */
  async assertDeptAdmin(actorId: string, departmentId: string): Promise<void> {
    const decision = await this.authzService.can(DEPT_ADMIN_PERMISSION, {
      userId: actorId,
      departmentId,
    });

    if (!decision.allowed) {
      throw new ForbiddenException(
        `User ${actorId} does not have department admin rights for department ${departmentId}`,
      );
    }
  }

  // ── Role management ──────────────────────────────────────────────────────────

  /**
   * List all role assignments scoped to a department.
   */
  async listDeptAssignments(
    actorId: string,
    departmentId: string,
  ): Promise<UserRoleAssignment[]> {
    await this.assertDeptAdmin(actorId, departmentId);

    return this.assignmentRepo.find({
      where: { departmentScopeId: departmentId, revokedAt: IsNull() },
      relations: ['role'],
      order: { createdAt: 'DESC' },
    });
  }

  /**
   * Grant a role to a user within this department.
   * Dept admins cannot grant system roles or roles they themselves do not hold.
   */
  async grantDeptRole(
    actorId: string,
    departmentId: string,
    dto: GrantDeptRoleDto,
  ): Promise<UserRoleAssignment> {
    await this.assertDeptAdmin(actorId, departmentId);

    const role = await this.roleRepo.findOne({ where: { id: dto.roleId } });
    if (!role) throw new NotFoundException(`Role ${dto.roleId} not found`);

    if (role.isSystemRole) {
      throw new ForbiddenException('Department admins cannot grant system roles');
    }

    // Prevent privilege escalation: the granting admin must hold the role in this dept
    await this.assertAdminHoldsRole(actorId, departmentId, dto.roleId);

    // Prevent duplicate active assignment
    const existing = await this.assignmentRepo.findOne({
      where: {
        userId: dto.targetUserId,
        roleId: dto.roleId,
        departmentScopeId: departmentId,
        revokedAt: IsNull(),
      },
    });

    if (existing) {
      throw new BadRequestException('User already holds this role in this department');
    }

    const assignment = await this.assignmentRepo.save(
      this.assignmentRepo.create({
        userId: dto.targetUserId,
        roleId: dto.roleId,
        departmentScopeId: departmentId,
        grantedById: actorId,
        expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
      }),
    );

    this.events.emit('authz.role.granted', {
      actorId,
      targetUserId: dto.targetUserId,
      roleId: dto.roleId,
      departmentId,
      timestamp: new Date(),
    });

    this.logger.log(
      `Dept admin ${actorId} granted role ${role.name} to user ${dto.targetUserId} in dept ${departmentId}`,
    );

    return assignment;
  }

  /**
   * Revoke a role assignment within this department.
   * Dept admins can only revoke assignments they manage (same dept scope).
   */
  async revokeDeptRole(
    actorId: string,
    departmentId: string,
    dto: RevokeDeptRoleDto,
  ): Promise<void> {
    await this.assertDeptAdmin(actorId, departmentId);

    const assignment = await this.assignmentRepo.findOne({
      where: {
        id: dto.assignmentId,
        departmentScopeId: departmentId,
        revokedAt: IsNull(),
      },
    });

    if (!assignment) {
      throw new NotFoundException('Assignment not found or already revoked');
    }

    await this.assignmentRepo.update(assignment.id, { revokedAt: new Date() });

    this.events.emit('authz.role.revoked', {
      actorId,
      assignmentId: dto.assignmentId,
      departmentId,
      timestamp: new Date(),
    });
  }

  // ── Workflow template management ─────────────────────────────────────────────

  /**
   * List workflow templates owned by this department.
   * Returned from EdmsService via the department owner filter.
   */
  async listDeptWorkflowTemplates(
    actorId: string,
    departmentId: string,
  ): Promise<any[]> {
    await this.assertDeptAdmin(actorId, departmentId);

    // Fetched via raw query to avoid circular module dependency on EdmsModule
    return this.assignmentRepo.query(
      `SELECT wt.id, wt.name, wt.description, wt.document_type_id, wt.version, wt.active, wt.created_at
         FROM edms.workflow_templates wt
        WHERE wt.owner_department_id = $1
        ORDER BY wt.created_at DESC`,
      [departmentId],
    );
  }

  /**
   * Deactivate a department-owned workflow template.
   * Only the owning department admin can deactivate it.
   */
  async deactivateDeptTemplate(
    actorId: string,
    departmentId: string,
    templateId: string,
  ): Promise<void> {
    await this.assertDeptAdmin(actorId, departmentId);

    const [template] = await this.assignmentRepo.query(
      `SELECT id FROM edms.workflow_templates
        WHERE id = $1 AND owner_department_id = $2`,
      [templateId, departmentId],
    );

    if (!template) {
      throw new NotFoundException('Template not found or not owned by this department');
    }

    await this.assignmentRepo.query(
      `UPDATE edms.workflow_templates SET active = FALSE WHERE id = $1`,
      [templateId],
    );
  }

  // ── Internal ────────────────────────────────────────────────────────────────

  private async assertAdminHoldsRole(
    actorId: string,
    departmentId: string,
    roleId: string,
  ): Promise<void> {
    const holdsRole = await this.assignmentRepo.findOne({
      where: {
        userId: actorId,
        roleId,
        departmentScopeId: departmentId,
        revokedAt: IsNull(),
      },
    });

    if (!holdsRole) {
      throw new ForbiddenException(
        'Cannot grant a role you do not hold in this department',
      );
    }
  }
}
