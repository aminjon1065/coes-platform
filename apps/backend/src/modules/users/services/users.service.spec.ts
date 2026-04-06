import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';

import { UsersService } from './users.service';
import { UserProfile, UserStatus } from '../entities/user-profile.entity';
import { UserPositionAssignment, AssignmentType } from '../entities/user-position-assignment.entity';
import { UserPreferences, AppLanguage } from '../entities/user-preferences.entity';
import { OrgService } from '../../org/services/org.service';

// ─── helpers ────────────────────────────────────────────────────────────────

const uid = () => 'usr-' + Math.random().toString(36).slice(2, 8);

const mockProfile = (overrides: Partial<UserProfile> = {}): UserProfile =>
  ({
    id: 'usr-1',
    credentialId: 'cred-1',
    email: 'officer@coescd.tj',
    firstName: 'Ahmad',
    lastName: 'Karimov',
    middleName: null,
    displayName: null,
    phone: null,
    clearanceLevel: 1,
    status: UserStatus.ACTIVE,
    positionAssignments: [],
    preferences: null,
    ...overrides,
  } as UserProfile);

const mockAssignment = (overrides: Partial<UserPositionAssignment> = {}): UserPositionAssignment =>
  ({
    id: 'asgn-1',
    userId: 'usr-1',
    positionId: 'pos-1',
    type: AssignmentType.PRIMARY,
    assignedById: 'actor-1',
    assignedAt: new Date(),
    vacatedAt: null,
    vacatedById: null,
    ...overrides,
  } as UserPositionAssignment);

const mockPrefs = (): UserPreferences =>
  ({
    id: 'prefs-1',
    userId: 'usr-1',
    language: AppLanguage.RU,
    notifyEmail: true,
    notifySms: false,
    notifyInApp: true,
  } as UserPreferences);

function makeRepo<T>() {
  return {
    create: jest.fn((d) => ({ ...d })),
    save: jest.fn(async (d) => ({ id: uid(), ...d })),
    findOne: jest.fn(),
    find: jest.fn(),
    findAndCount: jest.fn(),
    update: jest.fn(),
  };
}

// ─── test suite ─────────────────────────────────────────────────────────────

describe('UsersService', () => {
  let service: UsersService;
  let profileRepo: ReturnType<typeof makeRepo<UserProfile>>;
  let assignmentRepo: ReturnType<typeof makeRepo<UserPositionAssignment>>;
  let prefsRepo: ReturnType<typeof makeRepo<UserPreferences>>;
  let orgService: jest.Mocked<OrgService>;
  let events: jest.Mocked<EventEmitter2>;

  beforeEach(async () => {
    profileRepo = makeRepo<UserProfile>();
    assignmentRepo = makeRepo<UserPositionAssignment>();
    prefsRepo = makeRepo<UserPreferences>();
    orgService = {
      getPositionById: jest.fn(),
    } as unknown as jest.Mocked<OrgService>;
    events = { emit: jest.fn() } as unknown as jest.Mocked<EventEmitter2>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: getRepositoryToken(UserProfile), useValue: profileRepo },
        { provide: getRepositoryToken(UserPositionAssignment), useValue: assignmentRepo },
        { provide: getRepositoryToken(UserPreferences), useValue: prefsRepo },
        { provide: OrgService, useValue: orgService },
        { provide: EventEmitter2, useValue: events },
      ],
    }).compile();

    service = module.get(UsersService);
  });

  // ── createProfile ──────────────────────────────────────────────────────────

  describe('createProfile', () => {
    const dto = {
      credentialId: 'cred-1',
      email: 'officer@coescd.tj',
      firstName: 'Ahmad',
      lastName: 'Karimov',
      clearanceLevel: 1,
    };

    it('creates profile and default preferences', async () => {
      profileRepo.findOne.mockResolvedValue(null);
      profileRepo.save.mockResolvedValue(mockProfile());
      prefsRepo.save.mockResolvedValue(mockPrefs());

      const result = await service.createProfile(dto as any, 'actor-1');

      expect(profileRepo.save).toHaveBeenCalled();
      expect(prefsRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ language: AppLanguage.RU, notifyInApp: true }),
      );
      expect(events.emit).toHaveBeenCalledWith(
        'users.profile.created',
        expect.objectContaining({ credentialId: dto.credentialId }),
      );
      expect(result.email).toBe(dto.email);
    });

    it('throws ConflictException when credential or email already exists', async () => {
      profileRepo.findOne.mockResolvedValue(mockProfile());

      await expect(service.createProfile(dto as any)).rejects.toThrow(ConflictException);
      expect(profileRepo.save).not.toHaveBeenCalled();
    });
  });

  // ── getProfileById ─────────────────────────────────────────────────────────

  describe('getProfileById', () => {
    it('returns profile with relations', async () => {
      profileRepo.findOne.mockResolvedValue(mockProfile());

      const result = await service.getProfileById('usr-1');

      expect(profileRepo.findOne).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'usr-1' } }),
      );
      expect(result.id).toBe('usr-1');
    });

    it('throws NotFoundException when profile not found', async () => {
      profileRepo.findOne.mockResolvedValue(null);

      await expect(service.getProfileById('ghost')).rejects.toThrow(NotFoundException);
    });
  });

  // ── getProfileByCredentialId ───────────────────────────────────────────────

  describe('getProfileByCredentialId', () => {
    it('looks up by credentialId', async () => {
      profileRepo.findOne.mockResolvedValue(mockProfile());

      const result = await service.getProfileByCredentialId('cred-1');

      expect(profileRepo.findOne).toHaveBeenCalledWith(
        expect.objectContaining({ where: { credentialId: 'cred-1' } }),
      );
      expect(result).toBeDefined();
    });

    it('throws NotFoundException when not found', async () => {
      profileRepo.findOne.mockResolvedValue(null);

      await expect(service.getProfileByCredentialId('ghost')).rejects.toThrow(NotFoundException);
    });
  });

  // ── updateProfile ──────────────────────────────────────────────────────────

  describe('updateProfile', () => {
    it('updates allowed fields and emits event', async () => {
      profileRepo.findOne.mockResolvedValue(mockProfile());
      profileRepo.save.mockResolvedValue(mockProfile({ firstName: 'Updated' }));

      const result = await service.updateProfile(
        'usr-1',
        { firstName: 'Updated' } as any,
        'actor-1',
      );

      expect(profileRepo.save).toHaveBeenCalled();
      expect(events.emit).toHaveBeenCalledWith(
        'users.profile.updated',
        expect.objectContaining({ userId: 'usr-1' }),
      );
      expect(result.firstName).toBe('Updated');
    });

    it('throws NotFoundException when profile not found', async () => {
      profileRepo.findOne.mockResolvedValue(null);

      await expect(service.updateProfile('ghost', {} as any, 'actor')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ── listProfiles ───────────────────────────────────────────────────────────

  describe('listProfiles', () => {
    it('returns paginated profiles', async () => {
      profileRepo.findAndCount.mockResolvedValue([[mockProfile(), mockProfile()], 2]);

      const [items, total] = await service.listProfiles({ limit: 20, offset: 0 });

      expect(items).toHaveLength(2);
      expect(total).toBe(2);
    });

    it('filters by status when provided', async () => {
      profileRepo.findAndCount.mockResolvedValue([[mockProfile()], 1]);

      await service.listProfiles({ status: UserStatus.ACTIVE });

      expect(profileRepo.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ status: UserStatus.ACTIVE }),
        }),
      );
    });
  });

  // ── assignPosition ─────────────────────────────────────────────────────────

  describe('assignPosition', () => {
    it('assigns a primary position, vacating any existing primary', async () => {
      profileRepo.findOne.mockResolvedValue(mockProfile());
      orgService.getPositionById.mockResolvedValue({ id: 'pos-1', active: true } as any);
      assignmentRepo.findOne.mockResolvedValue(null); // no existing active assignment
      assignmentRepo.find.mockResolvedValue([]); // no existing PRIMARY
      assignmentRepo.save.mockResolvedValue(mockAssignment());

      const result = await service.assignPosition(
        'usr-1',
        { positionId: 'pos-1', type: AssignmentType.PRIMARY } as any,
        'actor-1',
      );

      expect(assignmentRepo.save).toHaveBeenCalled();
      expect(events.emit).toHaveBeenCalledWith(
        'users.position.assigned',
        expect.any(Object),
      );
      expect(result.positionId).toBe('pos-1');
    });

    it('throws NotFoundException when user not found', async () => {
      profileRepo.findOne.mockResolvedValue(null);

      await expect(
        service.assignPosition('ghost', { positionId: 'pos-1' } as any, 'actor'),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequestException if position already occupied', async () => {
      profileRepo.findOne.mockResolvedValue(mockProfile());
      orgService.getPositionById.mockResolvedValue({ id: 'pos-1', active: true } as any);
      // Simulate existing occupant
      assignmentRepo.findOne.mockResolvedValue(mockAssignment({ userId: 'other-user' }));

      await expect(
        service.assignPosition(
          'usr-1',
          { positionId: 'pos-1', type: AssignmentType.PRIMARY } as any,
          'actor',
        ),
      ).rejects.toThrow();
    });
  });

  // ── vacatePosition ─────────────────────────────────────────────────────────

  describe('vacatePosition', () => {
    it('sets vacatedAt on active assignment', async () => {
      profileRepo.findOne.mockResolvedValue(mockProfile());
      assignmentRepo.findOne.mockResolvedValue(mockAssignment());
      assignmentRepo.save.mockResolvedValue({ ...mockAssignment(), vacatedAt: new Date() });

      await service.vacatePosition('usr-1', 'pos-1', 'actor-1');

      expect(assignmentRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ vacatedAt: expect.any(Date) }),
      );
    });

    it('throws NotFoundException when no active assignment found', async () => {
      profileRepo.findOne.mockResolvedValue(mockProfile());
      assignmentRepo.findOne.mockResolvedValue(null);

      await expect(service.vacatePosition('usr-1', 'pos-1', 'actor')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ── getActiveAssignments ───────────────────────────────────────────────────

  describe('getActiveAssignments', () => {
    it('returns only active (not vacated) assignments', async () => {
      const active = mockAssignment({ vacatedAt: null });
      assignmentRepo.find.mockResolvedValue([active]);

      const result = await service.getActiveAssignments('usr-1');

      expect(result).toHaveLength(1);
      expect(result[0].vacatedAt).toBeNull();
    });
  });

  // ── getPositionOccupant ────────────────────────────────────────────────────

  describe('getPositionOccupant', () => {
    it('returns the user occupying the position', async () => {
      assignmentRepo.findOne.mockResolvedValue(mockAssignment());
      profileRepo.findOne.mockResolvedValue(mockProfile());

      const result = await service.getPositionOccupant('pos-1');

      expect(result).not.toBeNull();
    });

    it('returns null when position is vacant', async () => {
      assignmentRepo.findOne.mockResolvedValue(null);

      const result = await service.getPositionOccupant('pos-empty');

      expect(result).toBeNull();
    });
  });

  // ── getPreferences / updatePreferences ────────────────────────────────────

  describe('getPreferences', () => {
    it('returns preferences for user', async () => {
      prefsRepo.findOne.mockResolvedValue(mockPrefs());

      const result = await service.getPreferences('usr-1');

      expect(result.language).toBe(AppLanguage.RU);
    });

    it('throws NotFoundException when preferences not found', async () => {
      prefsRepo.findOne.mockResolvedValue(null);

      await expect(service.getPreferences('ghost')).rejects.toThrow(NotFoundException);
    });
  });

  describe('updatePreferences', () => {
    it('persists updated preferences', async () => {
      prefsRepo.findOne.mockResolvedValue(mockPrefs());
      prefsRepo.save.mockResolvedValue({ ...mockPrefs(), language: AppLanguage.TG });

      const result = await service.updatePreferences('usr-1', { language: AppLanguage.TG } as any);

      expect(prefsRepo.save).toHaveBeenCalled();
      expect(result.language).toBe(AppLanguage.TG);
    });
  });

  // ── offboard ──────────────────────────────────────────────────────────────

  describe('offboard', () => {
    it('deactivates user and vacates all positions', async () => {
      profileRepo.findOne.mockResolvedValue(mockProfile({ status: UserStatus.ACTIVE }));
      assignmentRepo.find.mockResolvedValue([mockAssignment(), mockAssignment({ id: 'asgn-2' })]);
      assignmentRepo.save.mockResolvedValue({});
      profileRepo.save.mockResolvedValue(mockProfile({ status: UserStatus.INACTIVE }));

      await service.offboard('usr-1', 'actor-1');

      // Should vacate all active assignments
      expect(assignmentRepo.save).toHaveBeenCalledTimes(2);
      // Should mark user inactive
      expect(profileRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ status: UserStatus.INACTIVE }),
      );
      expect(events.emit).toHaveBeenCalledWith(
        'users.profile.offboarded',
        expect.objectContaining({ userId: 'usr-1' }),
      );
    });

    it('throws NotFoundException when user not found', async () => {
      profileRepo.findOne.mockResolvedValue(null);

      await expect(service.offboard('ghost', 'actor')).rejects.toThrow(NotFoundException);
    });
  });
});
