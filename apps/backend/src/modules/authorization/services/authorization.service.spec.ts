import { Repository } from 'typeorm';

import { AuthorizationService } from './authorization.service';
import { UserRoleAssignment } from '../entities/user-role-assignment.entity';
import { Role } from '../entities/role.entity';
import { Permission } from '../entities/permission.entity';
import { Delegation } from '../entities/delegation.entity';
import { OrgService } from '../../org/services/org.service';

// ── Mock helpers ──────────────────────────────────────────────────────────────

function mockRepo<T>(): jest.Mocked<Repository<T>> {
  return {
    findOne: jest.fn(),
    find: jest.fn(),
  } as unknown as jest.Mocked<Repository<T>>;
}

const PERM_INCIDENTS_CREATE: Permission = {
  id: 'perm-1',
  name: 'incidents:create',
  description: 'Create incidents',
  createdAt: new Date(),
} as any;

const PERM_INCIDENTS_READ: Permission = {
  id: 'perm-2',
  name: 'incidents:read',
  description: 'Read incidents',
  createdAt: new Date(),
} as any;

function makeRole(overrides: Partial<Role> = {}): Role {
  return {
    id: 'role-1',
    name: 'field-analyst',
    description: null,
    parentRoleId: null,
    permissions: [PERM_INCIDENTS_CREATE, PERM_INCIDENTS_READ],
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as Role;
}

function makeAssignment(overrides: Partial<UserRoleAssignment> = {}): UserRoleAssignment {
  return {
    id: 'assign-1',
    userId: 'user-1',
    roleId: 'role-1',
    departmentScopeId: null,
    grantedById: 'admin-1',
    expiresAt: null,
    revokedAt: null,
    createdAt: new Date(),
    role: makeRole(),
    ...overrides,
  } as UserRoleAssignment;
}

function makeDelegation(overrides: Partial<Delegation> = {}): Delegation {
  return {
    id: 'del-1',
    delegatorId: 'supervisor-1',
    delegateId: 'user-1',
    positionId: 'pos-1',
    startAt: new Date(Date.now() - 3600_000),
    endAt: new Date(Date.now() + 3600_000),
    revokedAt: null,
    createdAt: new Date(),
    ...overrides,
  } as Delegation;
}

// ── Test suite ─────────────────────────────────────────────────────────────────

describe('AuthorizationService', () => {
  let service: AuthorizationService;
  let assignmentRepo: jest.Mocked<Repository<UserRoleAssignment>>;
  let roleRepo: jest.Mocked<Repository<Role>>;
  let permRepo: jest.Mocked<Repository<Permission>>;
  let delegationRepo: jest.Mocked<Repository<Delegation>>;
  let cacheManager: { get: jest.Mock; set: jest.Mock };
  let orgService: jest.Mocked<Pick<OrgService, 'getDescendants'>>;

  beforeEach(() => {
    assignmentRepo = mockRepo<UserRoleAssignment>();
    roleRepo       = mockRepo<Role>();
    permRepo       = mockRepo<Permission>();
    delegationRepo = mockRepo<Delegation>();
    cacheManager   = { get: jest.fn().mockResolvedValue(null), set: jest.fn() };
    orgService     = { getDescendants: jest.fn().mockResolvedValue([]) } as any;

    service = new AuthorizationService(
      assignmentRepo as any,
      roleRepo as any,
      permRepo as any,
      delegationRepo as any,
      cacheManager as any,
      orgService as any,
    );
  });

  // ── Layer 3: Classification ────────────────────────────────────────────────

  describe('can() — Layer 3: Classification', () => {
    it('denies when user clearance is below resource classification', async () => {
      const decision = await service.can('incidents:read', {
        userId: 'user-1',
        resourceClassification: 3,
        userClearance: 2,
      });

      expect(decision.allowed).toBe(false);
      expect(decision.reason).toMatch(/clearance level 2/i);
    });

    it('does not apply classification check when values are undefined', async () => {
      assignmentRepo.find.mockResolvedValue([makeAssignment()]);
      delegationRepo.find.mockResolvedValue([]);

      const decision = await service.can('incidents:create', { userId: 'user-1' });

      expect(decision.allowed).toBe(true);
    });

    it('allows when user clearance equals resource classification', async () => {
      assignmentRepo.find.mockResolvedValue([makeAssignment()]);
      delegationRepo.find.mockResolvedValue([]);

      const decision = await service.can('incidents:read', {
        userId: 'user-1',
        resourceClassification: 2,
        userClearance: 2,
      });

      expect(decision.allowed).toBe(true);
    });
  });

  // ── Layer 1: RBAC ─────────────────────────────────────────────────────────

  describe('can() — Layer 1: RBAC', () => {
    it('allows when role directly grants the permission', async () => {
      assignmentRepo.find.mockResolvedValue([makeAssignment()]);
      delegationRepo.find.mockResolvedValue([]);

      const decision = await service.can('incidents:create', { userId: 'user-1' });

      expect(decision.allowed).toBe(true);
      expect(decision.reason).toMatch(/field-analyst/i);
    });

    it('denies when no role grants the permission', async () => {
      assignmentRepo.find.mockResolvedValue([
        makeAssignment({ role: makeRole({ permissions: [] }) }),
      ]);
      delegationRepo.find.mockResolvedValue([]);

      const decision = await service.can('documents:approve', { userId: 'user-1' });

      expect(decision.allowed).toBe(false);
    });

    it('denies when user has no role assignments', async () => {
      assignmentRepo.find.mockResolvedValue([]);
      delegationRepo.find.mockResolvedValue([]);

      const decision = await service.can('incidents:create', { userId: 'user-1' });

      expect(decision.allowed).toBe(false);
    });

    it('skips expired assignments', async () => {
      assignmentRepo.find.mockResolvedValue([
        makeAssignment({ expiresAt: new Date(Date.now() - 1000) }),
      ]);
      delegationRepo.find.mockResolvedValue([]);

      const decision = await service.can('incidents:create', { userId: 'user-1' });

      expect(decision.allowed).toBe(false);
    });
  });

  // ── Layer 1 + 2: RBAC with Scope ─────────────────────────────────────────

  describe('can() — Layer 2: Scope', () => {
    it('allows when target department IS the scope department (direct match)', async () => {
      assignmentRepo.find.mockResolvedValue([
        makeAssignment({ departmentScopeId: 'dept-A' }),
      ]);
      delegationRepo.find.mockResolvedValue([]);

      const decision = await service.can('incidents:create', {
        userId: 'user-1',
        departmentId: 'dept-A',
      });

      expect(decision.allowed).toBe(true);
    });

    it('allows when target department is a descendant of scope department', async () => {
      assignmentRepo.find.mockResolvedValue([
        makeAssignment({ departmentScopeId: 'dept-ROOT' }),
      ]);
      orgService.getDescendants.mockResolvedValue([
        { id: 'dept-CHILD' } as any,
        { id: 'dept-GRANDCHILD' } as any,
      ]);
      delegationRepo.find.mockResolvedValue([]);

      const decision = await service.can('incidents:create', {
        userId: 'user-1',
        departmentId: 'dept-CHILD',
      });

      expect(decision.allowed).toBe(true);
    });

    it('denies when target department is outside scope', async () => {
      assignmentRepo.find.mockResolvedValue([
        makeAssignment({ departmentScopeId: 'dept-A' }),
      ]);
      orgService.getDescendants.mockResolvedValue([]);  // dept-A has no descendants
      delegationRepo.find.mockResolvedValue([]);

      const decision = await service.can('incidents:create', {
        userId: 'user-1',
        departmentId: 'dept-B',
      });

      expect(decision.allowed).toBe(false);
    });
  });

  // ── Layer 1: Role Inheritance ─────────────────────────────────────────────

  describe('can() — Role inheritance', () => {
    it('allows via parent role permission when child has none', async () => {
      const parentRole = makeRole({
        id: 'parent-role',
        name: 'senior-analyst',
        permissions: [PERM_INCIDENTS_CREATE],
        parentRoleId: null,
      });
      const childRole = makeRole({
        id: 'child-role',
        name: 'junior-analyst',
        permissions: [],
        parentRoleId: 'parent-role',
      });
      assignmentRepo.find.mockResolvedValue([
        makeAssignment({ role: childRole, roleId: childRole.id }),
      ]);
      // roleRepo.findOne is called for parent lookup
      roleRepo.findOne.mockResolvedValue(parentRole);
      delegationRepo.find.mockResolvedValue([]);

      const decision = await service.can('incidents:create', { userId: 'user-1' });

      expect(decision.allowed).toBe(true);
    });

    it('prevents infinite loops in role inheritance (circular guard)', async () => {
      const circularRole = makeRole({
        id: 'role-loop',
        permissions: [],
        parentRoleId: 'role-loop',  // self-reference
      });
      roleRepo.findOne.mockResolvedValue(circularRole);
      assignmentRepo.find.mockResolvedValue([
        makeAssignment({ role: circularRole }),
      ]);
      delegationRepo.find.mockResolvedValue([]);

      const decision = await service.can('incidents:create', { userId: 'user-1' });

      expect(decision.allowed).toBe(false);
    });
  });

  // ── Layer 4: Delegation ───────────────────────────────────────────────────

  describe('can() — Layer 4: Delegation', () => {
    it('allows when active delegation grants permission via delegator role', async () => {
      // user-1 has no direct roles
      assignmentRepo.find.mockImplementation(async (opts: any) => {
        const uid = opts?.where?.userId;
        if (uid === 'user-1') return [];           // delegate has no direct roles
        if (uid === 'supervisor-1') return [makeAssignment({ userId: 'supervisor-1' })];
        return [];
      });

      delegationRepo.find.mockResolvedValue([makeDelegation()]);

      const decision = await service.can('incidents:create', { userId: 'user-1' });

      expect(decision.allowed).toBe(true);
      expect(decision.reason).toMatch(/delegated/i);
    });

    it('ignores expired delegations', async () => {
      assignmentRepo.find.mockResolvedValue([]);
      delegationRepo.find.mockResolvedValue([
        makeDelegation({
          endAt: new Date(Date.now() - 1000),  // expired
        }),
      ]);

      const decision = await service.can('incidents:create', { userId: 'user-1' });

      expect(decision.allowed).toBe(false);
    });

    it('ignores future delegations (not yet started)', async () => {
      assignmentRepo.find.mockResolvedValue([]);
      delegationRepo.find.mockResolvedValue([
        makeDelegation({
          startAt: new Date(Date.now() + 3600_000),  // starts in 1h
        }),
      ]);

      const decision = await service.can('incidents:create', { userId: 'user-1' });

      expect(decision.allowed).toBe(false);
    });
  });

  // ── Cache behaviour ───────────────────────────────────────────────────────

  describe('cache', () => {
    it('returns cached decision without hitting the DB', async () => {
      const cached = { allowed: true, reason: 'cached' };
      cacheManager.get.mockResolvedValue(cached);

      const decision = await service.can('incidents:create', { userId: 'user-1' });

      expect(decision).toEqual(cached);
      expect(assignmentRepo.find).not.toHaveBeenCalled();
    });

    it('stores decision in cache after DB lookup', async () => {
      cacheManager.get.mockResolvedValue(null);
      assignmentRepo.find.mockResolvedValue([makeAssignment()]);
      delegationRepo.find.mockResolvedValue([]);

      await service.can('incidents:create', { userId: 'user-1' });

      expect(cacheManager.set).toHaveBeenCalledWith(
        expect.stringContaining('user-1'),
        expect.objectContaining({ allowed: true }),
        60,
      );
    });
  });
});
