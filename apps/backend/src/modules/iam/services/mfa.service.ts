import {
  Injectable,
  BadRequestException,
  Inject,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { generateSecret, generateURI, verify } from 'otplib';
import * as QRCode from 'qrcode';
import * as crypto from 'crypto';

import { MfaCredential, BackupCode } from '../entities/mfa-credential.entity';
import { IamService, TokenPair } from './iam.service';

const BACKUP_CODE_COUNT = 10;
const MFA_PENDING_EXPIRES = '5m';
const ISSUER = 'CoESCD';

interface MfaPendingPayload {
  sub: string;
  username: string;
  scope: 'mfa_pending';
}

@Injectable()
export class MfaService {
  constructor(
    @InjectRepository(MfaCredential)
    private readonly mfaRepo: Repository<MfaCredential>,
    private readonly iamService: IamService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
    @Inject(CACHE_MANAGER) private readonly cache: Cache,
  ) {}

  // ── Status ─────────────────────────────────────────────────────────────────

  async getStatus(userId: string): Promise<{ enabled: boolean; hasSetup: boolean }> {
    const record = await this.mfaRepo.findOne({ where: { userId } });
    return {
      enabled: record?.enabled ?? false,
      hasSetup: !!record,
    };
  }

  // ── Setup ──────────────────────────────────────────────────────────────────

  /**
  * Step 1 of setup: generate a new TOTP secret and return the QR code.
  * The secret is saved but MFA is NOT enabled yet until confirmed.
  */
  async initSetup(userId: string, username: string): Promise<{ secret: string; qrCodeDataUri: string; otpauthUri: string }> {
    const secret = generateSecret({ length: 20 });
    const otpauthUri = generateURI({ label: username, issuer: ISSUER, secret });
    const qrCodeDataUri = await QRCode.toDataURL(otpauthUri);

    // Upsert — user may re-init setup without confirming
    let record = await this.mfaRepo.findOne({ where: { userId } });
    if (record) {
      await this.mfaRepo.update(record.id, { secret, enabled: false, verifiedAt: null });
    } else {
      record = this.mfaRepo.create({ userId, secret, enabled: false, backupCodes: [] });
      await this.mfaRepo.save(record);
    }

    return { secret, qrCodeDataUri, otpauthUri };
  }

  /**
   * Step 2 of setup: user confirms the TOTP token to prove the app is configured.
   * Enables MFA and returns one-time backup codes (shown once, not retrievable later).
   */
  async confirmSetup(userId: string, token: string): Promise<{ backupCodes: string[] }> {
    const record = await this.mfaRepo.findOne({ where: { userId } });
    if (!record) {
      throw new NotFoundException('MFA setup not initiated');
    }
    if (record.enabled) {
      throw new BadRequestException('MFA is already enabled');
    }

    const isValid = verify({ token, secret: record.secret });
    if (!isValid) {
      throw new UnauthorizedException('Invalid TOTP token');
    }

    const plainCodes = this.generatePlainBackupCodes();
    const hashedCodes: BackupCode[] = plainCodes.map(code => ({
      hash: this.hashCode(code),
      used: false,
      usedAt: null,
    }));

    await this.mfaRepo.update(record.id, {
      enabled: true,
      verifiedAt: new Date(),
      backupCodes: hashedCodes,
    });

    return { backupCodes: plainCodes };
  }

  // ── Disable ────────────────────────────────────────────────────────────────

  async disable(userId: string, token: string): Promise<void> {
    const record = await this.mfaRepo.findOneOrFail({ where: { userId } });

    const isValid = verify({ token, secret: record.secret });
    if (!isValid) {
      throw new UnauthorizedException('Invalid TOTP token');
    }

    await this.mfaRepo.update(record.id, {
      enabled: false,
      verifiedAt: null,
      backupCodes: [],
    });
  }

  // ── MFA Pending Token ──────────────────────────────────────────────────────

  /**
   * Issue a short-lived JWT that allows completing the MFA step.
   * Called by IamService after password is validated and MFA is required.
   */
  issueMfaPendingToken(credentialId: string, username: string): string {
    const payload: MfaPendingPayload = {
      sub: credentialId,
      username,
      scope: 'mfa_pending',
    };
    return this.jwtService.sign(payload, {
      secret: this.config.get<string>('jwt.accessSecret'),
      expiresIn: MFA_PENDING_EXPIRES,
    });
  }

  // ── Verify MFA Step ────────────────────────────────────────────────────────

  /**
   * Validate the MFA pending token + TOTP code, then issue a full token pair.
   */
  async verifyAndIssueTokens(
    mfaToken: string,
    totpCode: string,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<TokenPair> {
    const payload = this.validateMfaPendingToken(mfaToken);
    const record = await this.mfaRepo.findOne({ where: { userId: payload.sub } });

    if (!record?.enabled) {
      throw new BadRequestException('MFA is not enabled for this account');
    }

    const isValid = verify({ token: totpCode, secret: record.secret });
    if (!isValid) {
      throw new UnauthorizedException('Invalid TOTP token');
    }

    // Prevent replay: each TOTP code is valid only once per 30-second window
    const replayKey = `totp_used:${record.id}:${totpCode}`;
    const alreadyUsed = await this.cache.get(replayKey);
    if (alreadyUsed) {
      throw new UnauthorizedException('TOTP code already used');
    }
    await this.cache.set(replayKey, true, 90_000); // 3 windows to handle clock skew

    return this.iamService.issueTokensForCredential(payload.sub, ipAddress, userAgent);
  }

  /**
   * Validate the MFA pending token + backup code, then issue a full token pair.
   */
  async verifyBackupAndIssueTokens(
    mfaToken: string,
    backupCode: string,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<TokenPair> {
    const payload = this.validateMfaPendingToken(mfaToken);
    const record = await this.mfaRepo.findOne({ where: { userId: payload.sub } });

    if (!record?.enabled) {
      throw new BadRequestException('MFA is not enabled for this account');
    }

    const codeHash = this.hashCode(backupCode);
    const match = record.backupCodes.find(c => c.hash === codeHash && !c.used);

    if (!match) {
      throw new UnauthorizedException('Invalid or already-used backup code');
    }

    // Mark code as used
    const updated = record.backupCodes.map(c =>
      c.hash === codeHash ? { ...c, used: true, usedAt: new Date().toISOString() } : c,
    );
    await this.mfaRepo.update(record.id, { backupCodes: updated });

    return this.iamService.issueTokensForCredential(payload.sub, ipAddress, userAgent);
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  private validateMfaPendingToken(token: string): MfaPendingPayload {
    try {
      const payload = this.jwtService.verify<MfaPendingPayload>(token, {
        secret: this.config.get<string>('jwt.accessSecret'),
      });
      if (payload.scope !== 'mfa_pending') {
        throw new UnauthorizedException('Invalid MFA token scope');
      }
      return payload;
    } catch {
      throw new UnauthorizedException('Invalid or expired MFA token');
    }
  }

  private generatePlainBackupCodes(): string[] {
    return Array.from({ length: BACKUP_CODE_COUNT }, () => {
      const bytes = crypto.randomBytes(4);
      const hex = bytes.toString('hex').toUpperCase();
      return `${hex.slice(0, 4)}-${hex.slice(4, 8)}`;
    });
  }

  private hashCode(code: string): string {
    return crypto.createHash('sha256').update(code).digest('hex');
  }
}
