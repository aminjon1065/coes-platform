import {
  Injectable,
  ConflictException,
  UnauthorizedException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThan } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import * as bcrypt from 'bcrypt';
import { v4 as uuidv4 } from 'uuid';
import * as crypto from 'crypto';

import { UserCredential, CredentialStatus } from '../entities/user-credential.entity';
import { RefreshToken } from '../entities/refresh-token.entity';
import { RegisterDto } from '../dto/register.dto';

const BCRYPT_ROUNDS = 12;
const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_MINUTES = 30;

export interface JwtPayload {
  sub: string;       // credential id
  username: string;
  iat?: number;
  exp?: number;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

@Injectable()
export class IamService {
  constructor(
    @InjectRepository(UserCredential)
    private readonly credentialRepo: Repository<UserCredential>,
    @InjectRepository(RefreshToken)
    private readonly refreshTokenRepo: Repository<RefreshToken>,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
    private readonly events: EventEmitter2,
  ) {}

  async register(dto: RegisterDto, requestedBy?: string): Promise<UserCredential> {
    const existing = await this.credentialRepo.findOne({
      where: [{ username: dto.username }, { email: dto.email }],
    });
    if (existing) {
      throw new ConflictException('Username or email already in use');
    }

    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);

    const credential = this.credentialRepo.create({
      username: dto.username,
      email: dto.email,
      passwordHash,
      isServiceAccount: dto.isServiceAccount ?? false,
      status: CredentialStatus.ACTIVE,
    });

    const saved = await this.credentialRepo.save(credential);

    this.events.emit('iam.user.registered', {
      userId: saved.id,
      username: saved.username,
      requestedBy,
      timestamp: new Date(),
    });

    return saved;
  }

  async login(
    username: string,
    password: string,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<TokenPair> {
    const credential = await this.credentialRepo.findOne({
      where: { username },
    });

    if (!credential) {
      // Constant-time hash to prevent timing attacks
      await bcrypt.hash(password, BCRYPT_ROUNDS);
      throw new UnauthorizedException('Invalid credentials');
    }

    if (credential.status === CredentialStatus.LOCKED) {
      if (credential.lockedUntil && credential.lockedUntil > new Date()) {
        throw new ForbiddenException('Account is temporarily locked');
      }
      // Lockout period expired — reset
      await this.credentialRepo.update(credential.id, {
        status: CredentialStatus.ACTIVE,
        failedAttempts: 0,
        lockedUntil: null,
      });
      credential.status = CredentialStatus.ACTIVE;
      credential.failedAttempts = 0;
    }

    if (credential.status === CredentialStatus.SUSPENDED) {
      throw new ForbiddenException('Account has been suspended');
    }

    const passwordValid = await bcrypt.compare(password, credential.passwordHash);

    if (!passwordValid) {
      await this.recordFailedAttempt(credential);
      throw new UnauthorizedException('Invalid credentials');
    }

    // Success — reset failed attempts
    await this.credentialRepo.update(credential.id, {
      failedAttempts: 0,
      lastLoginAt: new Date(),
    });

    const tokens = await this.issueTokenPair(credential, uuidv4(), ipAddress, userAgent);

    this.events.emit('iam.user.login', {
      userId: credential.id,
      username: credential.username,
      ipAddress,
      timestamp: new Date(),
    });

    return tokens;
  }

  async refreshTokens(rawRefreshToken: string, ipAddress?: string): Promise<TokenPair> {
    const tokenHash = this.hashToken(rawRefreshToken);

    const stored = await this.refreshTokenRepo.findOne({
      where: { tokenHash },
      relations: ['user'],
    });

    if (!stored) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    if (stored.revokedAt) {
      // Token reuse detected — revoke entire family (refresh token rotation security)
      await this.revokeFamilyTokens(stored.userId, stored.family);
      this.events.emit('iam.token.reuse_detected', {
        userId: stored.userId,
        family: stored.family,
        ipAddress,
        timestamp: new Date(),
      });
      throw new UnauthorizedException('Token reuse detected — all sessions invalidated');
    }

    if (stored.expiresAt < new Date()) {
      throw new UnauthorizedException('Refresh token expired');
    }

    if (stored.user.status !== CredentialStatus.ACTIVE) {
      throw new ForbiddenException('Account is not active');
    }

    // Revoke old token
    await this.refreshTokenRepo.update(stored.id, { revokedAt: new Date() });

    // Issue new pair with same family
    return this.issueTokenPair(stored.user, stored.family, ipAddress);
  }

  async logout(rawRefreshToken: string): Promise<void> {
    const tokenHash = this.hashToken(rawRefreshToken);
    await this.refreshTokenRepo.update(
      { tokenHash },
      { revokedAt: new Date() },
    );
  }

  async logoutAll(userId: string): Promise<void> {
    await this.refreshTokenRepo
      .createQueryBuilder()
      .update()
      .set({ revokedAt: new Date() })
      .where('user_id = :userId AND revoked_at IS NULL', { userId })
      .execute();
  }

  async validateCredential(id: string): Promise<UserCredential | null> {
    return this.credentialRepo.findOne({ where: { id, status: CredentialStatus.ACTIVE } });
  }

  private async issueTokenPair(
    credential: UserCredential,
    family: string,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<TokenPair> {
    const payload: JwtPayload = {
      sub: credential.id,
      username: credential.username,
    };

    const accessExpiresIn = this.config.get<string>('jwt.accessExpiresIn', '15m');
    const refreshExpiresIn = this.config.get<string>('jwt.refreshExpiresIn', '7d');

    const accessToken = this.jwtService.sign(payload, {
      secret: this.config.get<string>('jwt.accessSecret'),
      expiresIn: accessExpiresIn,
    });

    const rawRefreshToken = uuidv4() + uuidv4(); // 72-char opaque token
    const tokenHash = this.hashToken(rawRefreshToken);

    const refreshExpiresMs = this.parseExpiry(refreshExpiresIn);

    await this.refreshTokenRepo.save(
      this.refreshTokenRepo.create({
        userId: credential.id,
        tokenHash,
        family,
        expiresAt: new Date(Date.now() + refreshExpiresMs),
        ipAddress: ipAddress ?? null,
        userAgent: userAgent ?? null,
      }),
    );

    // Return raw refresh token (stored only as hash)
    return {
      accessToken,
      refreshToken: rawRefreshToken,
      expiresIn: this.parseExpiry(accessExpiresIn) / 1000,
    };
  }

  private async recordFailedAttempt(credential: UserCredential): Promise<void> {
    const newCount = credential.failedAttempts + 1;
    const updates: Partial<UserCredential> = { failedAttempts: newCount };

    if (newCount >= MAX_FAILED_ATTEMPTS) {
      updates.status = CredentialStatus.LOCKED;
      updates.lockedUntil = new Date(Date.now() + LOCKOUT_MINUTES * 60 * 1000);

      this.events.emit('iam.user.locked', {
        userId: credential.id,
        username: credential.username,
        timestamp: new Date(),
      });
    }

    await this.credentialRepo.update(credential.id, updates);
  }

  private async revokeFamilyTokens(userId: string, family: string): Promise<void> {
    await this.refreshTokenRepo
      .createQueryBuilder()
      .update()
      .set({ revokedAt: new Date() })
      .where('user_id = :userId AND family = :family AND revoked_at IS NULL', {
        userId,
        family,
      })
      .execute();
  }

  private hashToken(rawToken: string): string {
    return crypto.createHash('sha256').update(rawToken).digest('hex');
  }

  private parseExpiry(expiry: string): number {
    const units: Record<string, number> = {
      s: 1000,
      m: 60 * 1000,
      h: 60 * 60 * 1000,
      d: 24 * 60 * 60 * 1000,
    };
    const match = expiry.match(/^(\d+)([smhd])$/);
    if (!match) throw new Error(`Invalid expiry format: ${expiry}`);
    return parseInt(match[1], 10) * units[match[2]];
  }
}
