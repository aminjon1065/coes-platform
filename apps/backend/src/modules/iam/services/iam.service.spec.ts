import { ConflictException, UnauthorizedException, ForbiddenException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Repository, ObjectLiteral } from 'typeorm';
import * as bcrypt from 'bcrypt';

import { IamService } from './iam.service';
import { UserCredential, CredentialStatus } from '../entities/user-credential.entity';
import { RefreshToken } from '../entities/refresh-token.entity';
import { MfaCredential } from '../entities/mfa-credential.entity';

// ── Helpers ────────────────────────────────────────────────────────────────────

function mockRepo<T extends ObjectLiteral>(): jest.Mocked<Repository<T>> {
  return {
    findOne: jest.fn(),
    find: jest.fn(),
    save: jest.fn(),
    create: jest.fn((dto: Partial<T>) => dto as T),
    update: jest.fn(),
    createQueryBuilder: jest.fn().mockReturnValue({
      update: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      execute: jest.fn().mockResolvedValue({ affected: 1 }),
    }),
  } as unknown as jest.Mocked<Repository<T>>;
}

function makeCredential(overrides: Partial<UserCredential> = {}): UserCredential {
  return {
    id: 'cred-1',
    username: 'analyst01',
    email: 'analyst01@coescd.tj',
    passwordHash: '$2b$12$hashedpassword',
    status: CredentialStatus.ACTIVE,
    failedAttempts: 0,
    lockedUntil: null,
    lastLoginAt: null,
    passwordChangedAt: null,
    isServiceAccount: false,
    ssoProvider: null,
    ssoSubjectId: null,
    ssoAttributes: null,
    ssoLinkedAt: null,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    ...overrides,
  };
}

function makeRefreshToken(overrides: Partial<RefreshToken> = {}): RefreshToken {
  return {
    id: 'rt-1',
    userId: 'cred-1',
    tokenHash: 'abc123hash',
    family: 'family-uuid',
    expiresAt: new Date(Date.now() + 7 * 86400_000),
    revokedAt: null,
    ipAddress: '127.0.0.1',
    userAgent: 'test-agent',
    createdAt: new Date(),
    user: makeCredential(),
    ...overrides,
  };
}

// ── Setup ──────────────────────────────────────────────────────────────────────

describe('IamService', () => {
  let service: IamService;
  let credRepo: jest.Mocked<Repository<UserCredential>>;
  let rtRepo: jest.Mocked<Repository<RefreshToken>>;
  let mfaRepo: jest.Mocked<Repository<MfaCredential>>;
  let jwtService: jest.Mocked<JwtService>;
  let configService: jest.Mocked<ConfigService>;
  let events: jest.Mocked<EventEmitter2>;

  beforeEach(() => {
    credRepo     = mockRepo<UserCredential>();
    rtRepo       = mockRepo<RefreshToken>();
    mfaRepo      = mockRepo<MfaCredential>();
    jwtService   = { sign: jest.fn().mockReturnValue('jwt.access.token') } as any;
    configService = {
      get: jest.fn((key: string, fallback?: unknown) => {
        if (key === 'jwt.accessSecret')    return 'access-secret';
        if (key === 'jwt.accessExpiresIn') return '15m';
        if (key === 'jwt.refreshExpiresIn') return '7d';
        return fallback;
      }),
    } as any;
    events = { emit: jest.fn() } as any;

    service = new IamService(
      credRepo as any,
      rtRepo as any,
      mfaRepo as any,
      jwtService,
      configService,
      events,
    );
  });

  // ── register ─────────────────────────────────────────────────────────────────

  describe('register', () => {
    it('throws ConflictException when username or email already exists', async () => {
      credRepo.findOne.mockResolvedValue(makeCredential());

      await expect(
        service.register({ username: 'analyst01', email: 'analyst01@coescd.tj', password: 'P@ssw0rd!' }),
      ).rejects.toThrow(ConflictException);
    });

    it('hashes password and persists credential', async () => {
      credRepo.findOne.mockResolvedValue(null);
      const saved = makeCredential();
      credRepo.save.mockResolvedValue(saved);

      const result = await service.register({
        username: 'newuser',
        email: 'new@coescd.tj',
        password: 'SecurePass1!',
      });

      expect(credRepo.save).toHaveBeenCalledTimes(1);
      const created = credRepo.create.mock.calls[0][0] as Partial<UserCredential>;
      expect(created.passwordHash).not.toBe('SecurePass1!');
      const valid = await bcrypt.compare('SecurePass1!', created.passwordHash!);
      expect(valid).toBe(true);
      expect(result.id).toBe('cred-1');
    });

    it('emits iam.user.registered event on success', async () => {
      credRepo.findOne.mockResolvedValue(null);
      credRepo.save.mockResolvedValue(makeCredential());

      await service.register({ username: 'u', email: 'u@t.tj', password: 'Pass1!' });

      expect(events.emit).toHaveBeenCalledWith('iam.user.registered', expect.objectContaining({
        username: 'analyst01',
      }));
    });

    it('creates service account when flag is set', async () => {
      credRepo.findOne.mockResolvedValue(null);
      credRepo.save.mockResolvedValue(makeCredential({ isServiceAccount: true }));

      await service.register({
        username: 'svc-account',
        email: 'svc@coescd.tj',
        password: 'SvcPass1!',
        isServiceAccount: true,
      });

      const created = credRepo.create.mock.calls[0][0] as Partial<UserCredential>;
      expect(created.isServiceAccount).toBe(true);
    });
  });

  // ── login ─────────────────────────────────────────────────────────────────────

  describe('login', () => {
    it('throws UnauthorizedException when credential not found (timing-safe)', async () => {
      credRepo.findOne.mockResolvedValue(null);

      await expect(service.login('ghost', 'any')).rejects.toThrow(UnauthorizedException);
    });

    it('throws ForbiddenException when account is locked and lockout still active', async () => {
      credRepo.findOne.mockResolvedValue(
        makeCredential({
          status: CredentialStatus.LOCKED,
          lockedUntil: new Date(Date.now() + 60_000),
        }),
      );

      await expect(service.login('analyst01', 'Pass1!')).rejects.toThrow(ForbiddenException);
    });

    it('resets lock when lockout has expired and login succeeds', async () => {
      const expired = makeCredential({
        status: CredentialStatus.LOCKED,
        lockedUntil: new Date(Date.now() - 1000),  // already expired
        failedAttempts: 5,
      });
      credRepo.findOne.mockResolvedValue(expired);
      mfaRepo.findOne.mockResolvedValue(null);
      // After reset, password check uses the credential with status=ACTIVE
      jest.spyOn(bcrypt, 'compare' as any).mockResolvedValue(true as any);
      rtRepo.save.mockResolvedValue(makeRefreshToken());

      const result = await service.login('analyst01', 'Pass1!');

      expect(credRepo.update).toHaveBeenCalledWith(
        'cred-1',
        expect.objectContaining({ status: CredentialStatus.ACTIVE, failedAttempts: 0 }),
      );
      expect(result.mfaRequired).toBe(false);
      if (!result.mfaRequired) {
        expect(result.accessToken).toBeDefined();
      }
    });

    it('throws ForbiddenException when account is suspended', async () => {
      credRepo.findOne.mockResolvedValue(
        makeCredential({ status: CredentialStatus.SUSPENDED }),
      );

      await expect(service.login('analyst01', 'Pass1!')).rejects.toThrow(ForbiddenException);
    });

    it('throws UnauthorizedException on wrong password and increments failed attempts', async () => {
      const cred = makeCredential({ failedAttempts: 0 });
      credRepo.findOne.mockResolvedValue(cred);
      jest.spyOn(bcrypt, 'compare' as any).mockResolvedValue(false as any);

      await expect(service.login('analyst01', 'wrong')).rejects.toThrow(UnauthorizedException);

      expect(credRepo.update).toHaveBeenCalledWith(
        'cred-1',
        expect.objectContaining({ failedAttempts: 1 }),
      );
    });

    it('locks account after 5 failed attempts and emits iam.user.locked', async () => {
      const cred = makeCredential({ failedAttempts: 4 });
      credRepo.findOne.mockResolvedValue(cred);
      jest.spyOn(bcrypt, 'compare' as any).mockResolvedValue(false as any);

      await expect(service.login('analyst01', 'wrong')).rejects.toThrow(UnauthorizedException);

      expect(credRepo.update).toHaveBeenCalledWith(
        'cred-1',
        expect.objectContaining({
          status: CredentialStatus.LOCKED,
          failedAttempts: 5,
        }),
      );
      expect(events.emit).toHaveBeenCalledWith('iam.user.locked', expect.objectContaining({
        userId: 'cred-1',
      }));
    });

    it('returns token pair on successful login and emits iam.user.login', async () => {
      credRepo.findOne.mockResolvedValue(makeCredential());
      mfaRepo.findOne.mockResolvedValue(null);
      jest.spyOn(bcrypt, 'compare' as any).mockResolvedValue(true as any);
      rtRepo.save.mockResolvedValue(makeRefreshToken());

      const tokens = await service.login('analyst01', 'Pass1!', '10.0.0.1', 'Mozilla/5.0');

      expect(tokens.mfaRequired).toBe(false);
      if (!tokens.mfaRequired) {
        expect(tokens.accessToken).toBe('jwt.access.token');
        expect(tokens.refreshToken).toBeDefined();
        expect(tokens.expiresIn).toBe(900);  // 15m in seconds
      }
      expect(credRepo.update).toHaveBeenCalledWith(
        'cred-1',
        expect.objectContaining({ failedAttempts: 0, lastLoginAt: expect.any(Date) }),
      );
      expect(events.emit).toHaveBeenCalledWith('iam.user.login', expect.objectContaining({
        username: 'analyst01',
        ipAddress: '10.0.0.1',
      }));
    });
  });

  // ── refreshTokens ─────────────────────────────────────────────────────────────

  describe('refreshTokens', () => {
    it('throws UnauthorizedException when token not found', async () => {
      rtRepo.findOne.mockResolvedValue(null);

      await expect(service.refreshTokens('bad-token')).rejects.toThrow(UnauthorizedException);
    });

    it('detects token reuse, revokes family, emits event, and throws', async () => {
      rtRepo.findOne.mockResolvedValue(
        makeRefreshToken({ revokedAt: new Date() }),
      );
      // Mock the family revocation query builder
      const qbMock = {
        update: jest.fn().mockReturnThis(),
        set: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        execute: jest.fn().mockResolvedValue({ affected: 1 }),
      };
      rtRepo.createQueryBuilder.mockReturnValue(qbMock as any);

      await expect(service.refreshTokens('reused-token')).rejects.toThrow(
        UnauthorizedException,
      );
      expect(events.emit).toHaveBeenCalledWith('iam.token.reuse_detected', expect.any(Object));
    });

    it('throws UnauthorizedException when token is expired', async () => {
      rtRepo.findOne.mockResolvedValue(
        makeRefreshToken({ expiresAt: new Date(Date.now() - 1000) }),
      );

      await expect(service.refreshTokens('expired-token')).rejects.toThrow(UnauthorizedException);
    });

    it('throws ForbiddenException when user account is inactive', async () => {
      rtRepo.findOne.mockResolvedValue(
        makeRefreshToken({ user: makeCredential({ status: CredentialStatus.SUSPENDED }) }),
      );

      await expect(service.refreshTokens('valid-token')).rejects.toThrow(ForbiddenException);
    });

    it('revokes old token and issues new pair on valid refresh', async () => {
      rtRepo.findOne.mockResolvedValue(makeRefreshToken());
      rtRepo.save.mockResolvedValue(makeRefreshToken());

      const result = await service.refreshTokens('valid-token', '10.0.0.2');

      expect(rtRepo.update).toHaveBeenCalledWith(
        'rt-1',
        expect.objectContaining({ revokedAt: expect.any(Date) }),
      );
      expect(result.accessToken).toBe('jwt.access.token');
    });
  });

  // ── logout ────────────────────────────────────────────────────────────────────

  describe('logout', () => {
    it('marks the specific token as revoked', async () => {
      rtRepo.update.mockResolvedValue({ affected: 1 } as any);

      await service.logout('some-raw-token', 'cred-1');

      expect(rtRepo.update).toHaveBeenCalledWith(
        { tokenHash: expect.any(String), userId: 'cred-1' },
        { revokedAt: expect.any(Date) },
      );
    });
  });

  describe('logoutAll', () => {
    it('revokes all active tokens for the user via query builder', async () => {
      const qbMock = {
        update: jest.fn().mockReturnThis(),
        set: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        execute: jest.fn().mockResolvedValue({ affected: 3 }),
      };
      rtRepo.createQueryBuilder.mockReturnValue(qbMock as any);

      await service.logoutAll('cred-1');

      expect(qbMock.execute).toHaveBeenCalled();
    });
  });

  // ── validateCredential ────────────────────────────────────────────────────────

  describe('validateCredential', () => {
    it('returns null when credential not found or inactive', async () => {
      credRepo.findOne.mockResolvedValue(null);

      const result = await service.validateCredential('unknown-id');

      expect(result).toBeNull();
    });

    it('returns credential when active', async () => {
      const cred = makeCredential();
      credRepo.findOne.mockResolvedValue(cred);

      const result = await service.validateCredential('cred-1');

      expect(result).toBe(cred);
    });
  });
});
