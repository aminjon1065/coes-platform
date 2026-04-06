import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ForbiddenException, NotFoundException, BadRequestException } from '@nestjs/common';

import { DelegatedAdminService } from './delegated-admin.service';
import { AuthorizationService } from './authorization.service';
import { Role } from '../entities/role.entity';
import { UserRoleAssignment } from '../entities/user-role-assignment.entity';

// ── Helpers ──────────────────────────────────────────────────────────────────

const uid = () => require('crypto').randomUUID();

function makeRepo<T>(extra: Partial<Record<string, jest.Mock>> = {}) {
  return {
    findOne: jest.fn(),
    find: jest.fn(),
    create: jest.fn((d: any) => ({ ...d })),
    save: jest.fn(async (d: any) => ({ id: uid(), ...d })),
    update: jest.fn(),
    query: jest.fn(),
    ...extra,
  };
}

const ACTOR_ID = uid();
const DEPT_ID = uid();
const USER_ID = uid();

const MOCK_ROLE = {
  id: uid(),
  name: 'operator',
  isSystemRole: false,
  permissions: [],
};

const MOCK_ASSIGNMENT = {
  id: uid(),
  userId: USER_ID,
  roleId: MOCK_ROLE.id,
  departmentScopeId: DEPT_ID,
  grantedById: ACTOR_ID,
  revokedAt: null,
  createdAt: new Date(),
};

// ── Test suite ────────────────────────────────────────────────────────────────

describe('DelegatedAdminService', () => {
  let service: DelegatedAdminService;
  let roleRepo: ReturnType<typeof makeRepo>;
  let assignmentRepo: ReturnType<typeof makeRepo>;
  let authzService: jest.Mocked<Pick<AuthorizationService, 'can'>>;
  let events: jest.Mocked<EventEmitter2>;

  beforeEach(async () => {
    roleRepo = makeRepo();
    assignmentRepo = makeRepo();
    authzService = { can: jest.fn() } as any;
    events = { emit: jest.fn() } as any;

    // Default: actor is a dept admin
    (authzService.can as jest.Mock).mockResolvedValue({ allowed: true, reason: 'ok' });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DelegatedAdminService,
        { provide: getRepositoryToken(Role), useValue: roleRepo },
        { provide: getRepositoryToken(UserRoleAssignment), useValue: assignmentRepo },
        { provide: AuthorizationService, useValue: authzService },
        { provide: EventEmitter2, useValue: events },
      ],
    }).compile();

    service = module.get(DelegatedAdminService);
  });

  // ── assertDeptAdmin ──────────────────────────────────────────────────────────

  describe('assertDeptAdmin', () => {
    it('allows when authz returns allowed', async () => {
      (authzService.can as jest.Mock).mockResolvedValue({ allowed: true, reason: 'ok' });
      await expect(service.assertDeptAdmin(ACTOR_ID, DEPT_ID)).resolves.not.toThrow();
    });

    it('throws ForbiddenException when not dept admin', async () => {
      (authzService.can as jest.Mock).mockResolvedValue({ allowed: false, reason: 'no permission' });
      await expect(service.assertDeptAdmin(ACTOR_ID, DEPT_ID)).rejects.toThrow(ForbiddenException);
    });
  });

  // ── listDeptAssignments ──────────────────────────────────────────────────────

  describe('listDeptAssignments', () => {
    it('returns assignments for the department', async () => {
      assignmentRepo.find.mockResolvedValue([MOCK_ASSIGNMENT]);
      const result = await service.listDeptAssignments(ACTOR_ID, DEPT_ID);
      expect(result).toHaveLength(1);
      expect(assignmentRepo.find).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ departmentScopeId: DEPT_ID }) }),
      );
    });

    it('throws ForbiddenException for non-dept-admin', async () => {
      (authzService.can as jest.Mock).mockResolvedValue({ allowed: false, reason: 'denied' });
      await expect(service.listDeptAssignments(ACTOR_ID, DEPT_ID)).rejects.toThrow(ForbiddenException);
    });
  });

  // ── grantDeptRole ────────────────────────────────────────────────────────────

  describe('grantDeptRole', () => {
    const dto = { targetUserId: USER_ID, roleId: MOCK_ROLE.id };

    beforeEach(() => {
      roleRepo.findOne.mockImplementation(({ where }: any) => {
        if (where.id === MOCK_ROLE.id) return MOCK_ROLE;
        return null;
      });
      // Admin holds the role in this dept
      assignmentRepo.findOne.mockImplementation(({ where }: any) => {
        if (where.userId === ACTOR_ID && where.roleId === MOCK_ROLE.id) return MOCK_ASSIGNMENT;
        return null; // no existing grant for target user
      });
    });

    it('grants a role successfully', async () => {
      const result = await service.grantDeptRole(ACTOR_ID, DEPT_ID, dto);

      expect(assignmentRepo.save).toHaveBeenCalled();
      expect(events.emit).toHaveBeenCalledWith('authz.role.granted', expect.any(Object));
      expect(result).toHaveProperty('departmentScopeId', DEPT_ID);
    });

    it('throws NotFoundException when role does not exist', async () => {
      roleRepo.findOne.mockResolvedValue(null);
      await expect(service.grantDeptRole(ACTOR_ID, DEPT_ID, dto)).rejects.toThrow(NotFoundException);
    });

    it('throws ForbiddenException when trying to grant a system role', async () => {
      roleRepo.findOne.mockResolvedValue({ ...MOCK_ROLE, isSystemRole: true });
      await expect(service.grantDeptRole(ACTOR_ID, DEPT_ID, dto)).rejects.toThrow(ForbiddenException);
    });

    it('throws ForbiddenException when admin does not hold the role', async () => {
      assignmentRepo.findOne.mockResolvedValue(null); // admin doesn't hold role
      await expect(service.grantDeptRole(ACTOR_ID, DEPT_ID, dto)).rejects.toThrow(ForbiddenException);
    });

    it('throws BadRequestException on duplicate grant', async () => {
      assignmentRepo.findOne.mockImplementation(({ where }: any) => {
        // Both "admin holds role" and "target already has role" return truthy
        return MOCK_ASSIGNMENT;
      });
      await expect(service.grantDeptRole(ACTOR_ID, DEPT_ID, dto)).rejects.toThrow(BadRequestException);
    });
  });

  // ── revokeDeptRole ──────────────────────────────────────────────────────────

  describe('revokeDeptRole', () => {
    it('revokes an active assignment', async () => {
      assignmentRepo.findOne.mockResolvedValue(MOCK_ASSIGNMENT);

      await service.revokeDeptRole(ACTOR_ID, DEPT_ID, { assignmentId: MOCK_ASSIGNMENT.id });

      expect(assignmentRepo.update).toHaveBeenCalledWith(
        MOCK_ASSIGNMENT.id,
        expect.objectContaining({ revokedAt: expect.any(Date) }),
      );
      expect(events.emit).toHaveBeenCalledWith('authz.role.revoked', expect.any(Object));
    });

    it('throws NotFoundException when assignment not found', async () => {
      assignmentRepo.findOne.mockResolvedValue(null);
      await expect(
        service.revokeDeptRole(ACTOR_ID, DEPT_ID, { assignmentId: uid() }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ── listDeptWorkflowTemplates ────────────────────────────────────────────────

  describe('listDeptWorkflowTemplates', () => {
    it('returns templates for the department', async () => {
      const templates = [{ id: uid(), name: 'Dept Template' }];
      assignmentRepo.query.mockResolvedValue(templates);

      const result = await service.listDeptWorkflowTemplates(ACTOR_ID, DEPT_ID);

      expect(result).toEqual(templates);
      expect(assignmentRepo.query).toHaveBeenCalledWith(
        expect.stringContaining('owner_department_id'),
        [DEPT_ID],
      );
    });
  });

  // ── deactivateDeptTemplate ──────────────────────────────────────────────────

  describe('deactivateDeptTemplate', () => {
    it('deactivates a dept-owned template', async () => {
      const templateId = uid();
      assignmentRepo.query
        .mockResolvedValueOnce([{ id: templateId }]) // SELECT
        .mockResolvedValueOnce(undefined);            // UPDATE

      await service.deactivateDeptTemplate(ACTOR_ID, DEPT_ID, templateId);

      expect(assignmentRepo.query).toHaveBeenCalledTimes(2);
    });

    it('throws NotFoundException when template not owned by dept', async () => {
      assignmentRepo.query.mockResolvedValue([]); // no rows
      await expect(
        service.deactivateDeptTemplate(ACTOR_ID, DEPT_ID, uid()),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
