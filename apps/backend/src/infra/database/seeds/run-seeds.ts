import 'reflect-metadata';
import * as bcrypt from 'bcrypt';
import { IsNull } from 'typeorm';
import { AppDataSource } from '../data-source';
import { UserCredential, CredentialStatus } from '../../../modules/iam/entities/user-credential.entity';
import { UserProfile, UserStatus } from '../../../modules/users/entities/user-profile.entity';
import { UserPreferences, AppLanguage } from '../../../modules/users/entities/user-preferences.entity';
import {
  UserPositionAssignment,
  AssignmentType as UserAssignmentType,
} from '../../../modules/users/entities/user-position-assignment.entity';
import { Department } from '../../../modules/org/entities/department.entity';
import { Position, PositionLevel } from '../../../modules/org/entities/position.entity';
import { Role } from '../../../modules/authorization/entities/role.entity';
import { UserRoleAssignment } from '../../../modules/authorization/entities/user-role-assignment.entity';

const BCRYPT_ROUNDS = 12;

type SeedConfig = {
  adminUsername: string;
  adminEmail: string;
  adminPassword: string;
  adminFirstName: string;
  adminLastName: string;
  adminMiddleName: string | null;
  adminPhone: string | null;
  forceResetPassword: boolean;
};

function getSeedConfig(): SeedConfig {
  return {
    adminUsername: process.env.SEED_ADMIN_USERNAME ?? 'superadmin',
    adminEmail: process.env.SEED_ADMIN_EMAIL ?? 'superadmin@coescd.local',
    adminPassword: process.env.SEED_ADMIN_PASSWORD ?? 'ChangeMe123!',
    adminFirstName: process.env.SEED_ADMIN_FIRST_NAME ?? 'System',
    adminLastName: process.env.SEED_ADMIN_LAST_NAME ?? 'Administrator',
    adminMiddleName: process.env.SEED_ADMIN_MIDDLE_NAME ?? null,
    adminPhone: process.env.SEED_ADMIN_PHONE ?? null,
    forceResetPassword: process.env.SEED_FORCE_PASSWORD_RESET === 'true',
  };
}

async function ensureDepartment(
  name: string,
  shortCode: string,
  parent: Department | null,
  sortOrder: number,
) {
  await AppDataSource.query(
    `
      INSERT INTO org.departments (name, short_code, parent_id, active, sort_order)
      VALUES ($1, $2, $3, TRUE, $4)
      ON CONFLICT DO NOTHING
    `,
    [name, shortCode, parent?.id ?? null, sortOrder],
  );

  await AppDataSource.query(
    `
      UPDATE org.departments
      SET name = $1,
          parent_id = $3,
          active = TRUE,
          sort_order = $4,
          updated_at = NOW()
      WHERE short_code = $2
    `,
    [name, shortCode, parent?.id ?? null, sortOrder],
  );

  const rows = await AppDataSource.query(
    `
      SELECT id, name, name_ru, name_tg, short_code, parent_id, active, sort_order, created_at, updated_at
      FROM org.departments
      WHERE short_code = $1
      LIMIT 1
    `,
    [shortCode],
  );

  const saved = AppDataSource.getRepository(Department).create({
    id: rows[0].id,
    name: rows[0].name,
    nameRu: rows[0].name_ru,
    nameTg: rows[0].name_tg,
    shortCode: rows[0].short_code,
    parentId: rows[0].parent_id,
    active: rows[0].active,
    sortOrder: rows[0].sort_order,
    createdAt: rows[0].created_at,
    updatedAt: rows[0].updated_at,
  });

  await ensureDepartmentClosure(saved.id, parent?.id ?? null);
  return saved;
}

async function ensureDepartmentClosure(departmentId: string, parentId: string | null) {
  await AppDataSource.query(
    `
      INSERT INTO org.department_closure (ancestor_id, descendant_id, depth)
      VALUES ($1, $1, 0)
      ON CONFLICT (ancestor_id, descendant_id) DO UPDATE
      SET depth = EXCLUDED.depth
    `,
    [departmentId],
  );

  await AppDataSource.query(`DELETE FROM org.department_closure WHERE descendant_id = $1 AND ancestor_id <> $1`, [
    departmentId,
  ]);

  if (!parentId) {
    return;
  }

  await AppDataSource.query(
    `
      INSERT INTO org.department_closure (ancestor_id, descendant_id, depth)
      SELECT ancestor_id, $2, depth + 1
      FROM org.department_closure
      WHERE descendant_id = $1
      ON CONFLICT (ancestor_id, descendant_id) DO UPDATE
      SET depth = EXCLUDED.depth
    `,
    [parentId, departmentId],
  );
}

async function ensurePosition(
  title: string,
  department: Department,
  level: PositionLevel,
  options?: {
    reportsTo?: Position | null;
    canAssignTasks?: boolean;
    canApproveDocuments?: boolean;
    canIssueResolutions?: boolean;
  },
) {
  const repo = AppDataSource.getRepository(Position);

  let position = await repo.findOne({
    where: {
      title,
      departmentId: department.id,
    },
  });

  if (!position) {
    position = repo.create({
      title,
      departmentId: department.id,
      department,
      level,
      reportsToId: options?.reportsTo?.id ?? null,
      reportsTo: options?.reportsTo ?? null,
      canAssignTasks: options?.canAssignTasks ?? false,
      canApproveDocuments: options?.canApproveDocuments ?? false,
      canIssueResolutions: options?.canIssueResolutions ?? false,
      active: true,
    });
  } else {
    position.level = level;
    position.departmentId = department.id;
    position.department = department;
    position.reportsToId = options?.reportsTo?.id ?? null;
    position.reportsTo = options?.reportsTo ?? null;
    position.canAssignTasks = options?.canAssignTasks ?? false;
    position.canApproveDocuments = options?.canApproveDocuments ?? false;
    position.canIssueResolutions = options?.canIssueResolutions ?? false;
    position.active = true;
  }

  return repo.save(position);
}

async function ensureAdminCredential(config: SeedConfig) {
  const repo = AppDataSource.getRepository(UserCredential);

  let credential = await repo.findOne({
    where: [{ username: config.adminUsername }, { email: config.adminEmail }],
  });

  if (!credential) {
    credential = repo.create({
      username: config.adminUsername,
      email: config.adminEmail,
      passwordHash: await bcrypt.hash(config.adminPassword, BCRYPT_ROUNDS),
      status: CredentialStatus.ACTIVE,
      failedAttempts: 0,
      isServiceAccount: false,
    });

    return repo.save(credential);
  }

  credential.username = config.adminUsername;
  credential.email = config.adminEmail;
  credential.status = CredentialStatus.ACTIVE;
  credential.failedAttempts = 0;
  credential.lockedUntil = null;
  credential.isServiceAccount = false;

  if (config.forceResetPassword) {
    credential.passwordHash = await bcrypt.hash(config.adminPassword, BCRYPT_ROUNDS);
    credential.passwordChangedAt = new Date();
  }

  return repo.save(credential);
}

async function ensureAdminProfile(config: SeedConfig, credential: UserCredential) {
  const repo = AppDataSource.getRepository(UserProfile);

  let profile = await repo.findOne({
    where: { credentialId: credential.id },
  });

  if (!profile) {
    profile = repo.create({
      credentialId: credential.id,
      firstName: config.adminFirstName,
      lastName: config.adminLastName,
      middleName: config.adminMiddleName,
      displayName: `${config.adminLastName} ${config.adminFirstName}`.trim(),
      email: config.adminEmail,
      phone: config.adminPhone,
      status: UserStatus.ACTIVE,
      clearanceLevel: 3,
    });
  } else {
    profile.firstName = config.adminFirstName;
    profile.lastName = config.adminLastName;
    profile.middleName = config.adminMiddleName;
    profile.displayName = `${config.adminLastName} ${config.adminFirstName}`.trim();
    profile.email = config.adminEmail;
    profile.phone = config.adminPhone;
    profile.status = UserStatus.ACTIVE;
    profile.clearanceLevel = 3;
  }

  return repo.save(profile);
}

async function ensureAdminPreferences(profile: UserProfile) {
  const repo = AppDataSource.getRepository(UserPreferences);

  let preferences = await repo.findOne({
    where: { userId: profile.id },
  });

  if (!preferences) {
    preferences = repo.create({
      userId: profile.id,
      language: AppLanguage.EN,
      notifyEmail: true,
      notifySms: false,
      notifyInApp: true,
    });
  }

  return repo.save(preferences);
}

async function ensureAdminAssignment(profile: UserProfile, position: Position, grantedById: string) {
  const repo = AppDataSource.getRepository(UserPositionAssignment);

  let assignment = await repo.findOne({
    where: {
      userId: profile.id,
      positionId: position.id,
      vacatedAt: IsNull(),
    },
  });

  if (!assignment) {
    assignment = repo.create({
      userId: profile.id,
      positionId: position.id,
      type: UserAssignmentType.PRIMARY,
      assignedById: grantedById,
      notes: 'Seeded default primary platform administrator assignment.',
      vacatedAt: null,
      vacatedById: null,
    });
  } else {
    assignment.type = UserAssignmentType.PRIMARY;
    assignment.assignedById = grantedById;
    assignment.vacatedAt = null;
    assignment.vacatedById = null;
  }

  return repo.save(assignment);
}

async function ensureRoleAssignment(profile: UserProfile, roleName: string, position: Position, grantedById: string) {
  const roleRepo = AppDataSource.getRepository(Role);
  const assignmentRepo = AppDataSource.getRepository(UserRoleAssignment);

  const role = await roleRepo.findOne({
    where: { name: roleName },
  });

  if (!role) {
    throw new Error(`Required role was not found: ${roleName}`);
  }

  let assignment = await assignmentRepo.findOne({
    where: {
      userId: profile.id,
      roleId: role.id,
      revokedAt: IsNull(),
    },
  });

  if (!assignment) {
    assignment = assignmentRepo.create({
      userId: profile.id,
      roleId: role.id,
      positionId: position.id,
      grantedById,
      revokedAt: null,
    });
  } else {
    assignment.positionId = position.id;
    assignment.grantedById = grantedById;
    assignment.revokedAt = null;
  }

  return assignmentRepo.save(assignment);
}

async function runSeeds() {
  const config = getSeedConfig();

  await AppDataSource.initialize();

  try {
    const headquarters = await ensureDepartment('CoESCD Headquarters', 'HQ', null, 0);
    const administration = await ensureDepartment('Platform Administration', 'ADM', headquarters, 10);
    const security = await ensureDepartment('Security and Audit', 'SEC', headquarters, 20);

    const chairman = await ensurePosition('Chairman', headquarters, PositionLevel.CHAIRMAN, {
      canAssignTasks: true,
      canApproveDocuments: true,
      canIssueResolutions: true,
    });

    const platformAdmin = await ensurePosition(
      'Platform Administrator',
      administration,
      PositionLevel.DEPARTMENT_HEAD,
      {
        reportsTo: chairman,
        canAssignTasks: true,
        canApproveDocuments: true,
        canIssueResolutions: true,
      },
    );

    await ensurePosition('Security Auditor', security, PositionLevel.ANALYST, {
      reportsTo: chairman,
      canAssignTasks: false,
      canApproveDocuments: false,
      canIssueResolutions: false,
    });

    const credential = await ensureAdminCredential(config);
    const profile = await ensureAdminProfile(config, credential);

    await ensureAdminPreferences(profile);
    await ensureAdminAssignment(profile, platformAdmin, credential.id);
    await ensureRoleAssignment(profile, 'super_admin', platformAdmin, credential.id);
    await ensureRoleAssignment(profile, 'platform_admin', platformAdmin, credential.id);

    console.log('Seed complete.');
    console.log(`Admin username: ${config.adminUsername}`);
    console.log(`Admin email: ${config.adminEmail}`);

    if (config.forceResetPassword) {
      console.log('Admin password was reset from SEED_ADMIN_PASSWORD.');
    } else {
      console.log('Admin password was left unchanged for existing credentials.');
      console.log('Set SEED_FORCE_PASSWORD_RESET=true to rotate it during seeding.');
    }
  } finally {
    await AppDataSource.destroy();
  }
}

runSeeds().catch((error) => {
  console.error('Failed to run seeds', error);
  process.exit(1);
});
