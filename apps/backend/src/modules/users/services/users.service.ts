import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull, In } from 'typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';

import { UserProfile, UserStatus } from '../entities/user-profile.entity';
import { UserPositionAssignment, AssignmentType } from '../entities/user-position-assignment.entity';
import { UserPreferences, AppLanguage } from '../entities/user-preferences.entity';
import { CreateUserProfileDto } from '../dto/create-user-profile.dto';
import { UpdateUserProfileDto } from '../dto/update-user-profile.dto';
import { AssignPositionDto } from '../dto/assign-position.dto';
import { UpdatePreferencesDto } from '../dto/update-preferences.dto';
import { OrgService } from '../../org/services/org.service';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(UserProfile)
    private readonly profileRepo: Repository<UserProfile>,
    @InjectRepository(UserPositionAssignment)
    private readonly assignmentRepo: Repository<UserPositionAssignment>,
    @InjectRepository(UserPreferences)
    private readonly prefsRepo: Repository<UserPreferences>,
    private readonly orgService: OrgService,
    private readonly events: EventEmitter2,
  ) {}

  // ─────────────────────────────── Profiles ───────────────────────────────

  async createProfile(dto: CreateUserProfileDto, requestedBy?: string): Promise<UserProfile> {
    const existing = await this.profileRepo.findOne({
      where: [{ credentialId: dto.credentialId }, { email: dto.email }],
    });
    if (existing) {
      throw new ConflictException('A profile for this credential or email already exists');
    }

    const profile = this.profileRepo.create({
      credentialId: dto.credentialId,
      firstName: dto.firstName,
      lastName: dto.lastName,
      middleName: dto.middleName ?? null,
      displayName: dto.displayName ?? null,
      email: dto.email,
      phone: dto.phone ?? null,
      clearanceLevel: dto.clearanceLevel ?? 0,
      status: UserStatus.ACTIVE,
    });

    const saved = await this.profileRepo.save(profile);

    // Create default preferences
    await this.prefsRepo.save(
      this.prefsRepo.create({
        userId: saved.id,
        language: AppLanguage.RU,
        notifyEmail: true,
        notifySms: false,
        notifyInApp: true,
      }),
    );

    this.events.emit('users.profile.created', {
      userId: saved.id,
      credentialId: saved.credentialId,
      requestedBy,
    });

    return saved;
  }

  async getProfileById(id: string): Promise<UserProfile> {
    const profile = await this.profileRepo.findOne({
      where: { id },
      relations: ['positionAssignments', 'preferences'],
    });
    if (!profile) throw new NotFoundException(`User ${id} not found`);
    return profile;
  }

  async getProfileByCredentialId(credentialId: string): Promise<UserProfile> {
    const profile = await this.profileRepo.findOne({
      where: { credentialId },
      relations: ['positionAssignments', 'preferences'],
    });
    if (!profile) throw new NotFoundException(`Profile for credential ${credentialId} not found`);
    return profile;
  }

  async getProfilesByCredentialIds(credentialIds: string[]): Promise<UserProfile[]> {
    if (!credentialIds.length) {
      return [];
    }

    return this.profileRepo.find({
      where: { credentialId: In(credentialIds) },
    });
  }

  async updateProfile(
    id: string,
    dto: UpdateUserProfileDto,
    requestedBy?: string,
  ): Promise<UserProfile> {
    const profile = await this.getProfileById(id);
    Object.assign(profile, dto);
    const saved = await this.profileRepo.save(profile);

    this.events.emit('users.profile.updated', {
      userId: id,
      changes: dto,
      requestedBy,
    });

    return saved;
  }

  async listProfiles(opts: {
    status?: UserStatus;
    limit?: number;
    offset?: number;
    search?: string;
  }): Promise<[UserProfile[], number]> {
    const qb = this.profileRepo.createQueryBuilder('p');
    if (opts.status) {
      qb.where('p.status = :status', { status: opts.status });
    }

    if (opts.search?.trim()) {
      const search = `%${opts.search.trim().toLowerCase()}%`;
      qb.andWhere(
        `(
          LOWER(COALESCE(p.displayName, '')) LIKE :search
          OR LOWER(COALESCE(p.firstName, '')) LIKE :search
          OR LOWER(COALESCE(p.lastName, '')) LIKE :search
          OR LOWER(COALESCE(p.middleName, '')) LIKE :search
          OR LOWER(COALESCE(p.email, '')) LIKE :search
        )`,
        { search },
      );
    }

    return qb
      .orderBy('p.last_name', 'ASC')
      .addOrderBy('p.first_name', 'ASC')
      .limit(opts.limit ?? 50)
      .offset(opts.offset ?? 0)
      .getManyAndCount();
  }

  // ──────────────────────────── Position Assignments ──────────────────────

  async assignPosition(
    userId: string,
    dto: AssignPositionDto,
    assignedById?: string,
  ): Promise<UserPositionAssignment> {
    const profile = await this.getProfileById(userId);

    // Verify the position exists in the org domain
    const position = await this.orgService.getPositionById(dto.positionId);

    // If assigning PRIMARY, vacate any existing active PRIMARY assignment
    if ((dto.type ?? AssignmentType.PRIMARY) === AssignmentType.PRIMARY) {
      const activePrimary = await this.assignmentRepo.findOne({
        where: {
          userId,
          type: AssignmentType.PRIMARY,
          vacatedAt: IsNull(),
        },
      });
      if (activePrimary) {
        await this.assignmentRepo.update(activePrimary.id, {
          vacatedAt: new Date(),
          vacatedById: assignedById ?? null,
        });
        this.events.emit('users.position.vacated', {
          userId,
          positionId: activePrimary.positionId,
          assignmentId: activePrimary.id,
        });
      }
    }

    // Prevent duplicate active assignment to the same position
    const duplicate = await this.assignmentRepo.findOne({
      where: { userId, positionId: dto.positionId, vacatedAt: IsNull() },
    });
    if (duplicate) {
      throw new ConflictException(
        `User is already actively assigned to position ${dto.positionId}`,
      );
    }

    const assignment = this.assignmentRepo.create({
      userId,
      positionId: dto.positionId,
      type: dto.type ?? AssignmentType.PRIMARY,
      assignedAt: dto.assignedAt ? new Date(dto.assignedAt) : new Date(),
      vacatedAt: null,
      assignedById: assignedById ?? null,
      notes: dto.notes ?? null,
    });

    const saved = await this.assignmentRepo.save(assignment);

    this.events.emit('users.position.assigned', {
      userId,
      positionId: dto.positionId,
      assignmentId: saved.id,
      type: saved.type,
      departmentId: position.departmentId,
    });

    return saved;
  }

  async vacatePosition(
    userId: string,
    positionId: string,
    vacatedById?: string,
  ): Promise<void> {
    const assignment = await this.assignmentRepo.findOne({
      where: { userId, positionId, vacatedAt: IsNull() },
    });
    if (!assignment) {
      throw new NotFoundException(
        `No active assignment found for user ${userId} on position ${positionId}`,
      );
    }

    await this.assignmentRepo.update(assignment.id, {
      vacatedAt: new Date(),
      vacatedById: vacatedById ?? null,
    });

    this.events.emit('users.position.vacated', {
      userId,
      positionId,
      assignmentId: assignment.id,
    });
  }

  async getActiveAssignments(userId: string): Promise<UserPositionAssignment[]> {
    return this.assignmentRepo.find({
      where: { userId, vacatedAt: IsNull() },
      order: { type: 'ASC', assignedAt: 'DESC' },
    });
  }

  /**
   * Returns the user currently occupying a position (vacatedAt IS NULL).
   * Used by document routing and task assignment to resolve
   * "who holds this position right now".
   */
  async getPositionOccupant(positionId: string): Promise<UserProfile | null> {
    const assignment = await this.assignmentRepo.findOne({
      where: { positionId, vacatedAt: IsNull(), type: AssignmentType.PRIMARY },
      relations: ['user'],
    });
    return assignment?.user ?? null;
  }

  async getPositionHistory(positionId: string): Promise<UserPositionAssignment[]> {
    return this.assignmentRepo.find({
      where: { positionId },
      relations: ['user'],
      order: { assignedAt: 'DESC' },
    });
  }

  // ─────────────────────────────── Preferences ────────────────────────────

  async getPreferences(userId: string): Promise<UserPreferences> {
    const prefs = await this.prefsRepo.findOne({ where: { userId } });
    if (!prefs) throw new NotFoundException(`Preferences for user ${userId} not found`);
    return prefs;
  }

  async updatePreferences(
    userId: string,
    dto: UpdatePreferencesDto,
  ): Promise<UserPreferences> {
    const prefs = await this.getPreferences(userId);
    Object.assign(prefs, dto);
    return this.prefsRepo.save(prefs);
  }

  // ──────────────────────── Offboarding ───────────────────────────────────

  async offboard(userId: string, requestedBy?: string): Promise<void> {
    const profile = await this.getProfileById(userId);

    // Vacate all active position assignments
    const activeAssignments = await this.getActiveAssignments(userId);
    for (const assignment of activeAssignments) {
      await this.assignmentRepo.update(assignment.id, {
        vacatedAt: new Date(),
        vacatedById: requestedBy ?? null,
      });
      this.events.emit('users.position.vacated', {
        userId,
        positionId: assignment.positionId,
        assignmentId: assignment.id,
        reason: 'offboarding',
      });
    }

    await this.profileRepo.update(userId, { status: UserStatus.OFFBOARDED });

    this.events.emit('users.profile.offboarded', {
      userId,
      requestedBy,
    });
  }
}
