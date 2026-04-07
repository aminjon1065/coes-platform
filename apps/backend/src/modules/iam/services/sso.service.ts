import {
  Injectable,
  Logger,
  UnauthorizedException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { v4 as uuidv4 } from 'uuid';

import { UserCredential, CredentialStatus } from '../entities/user-credential.entity';
import { RefreshToken } from '../entities/refresh-token.entity';
import {
  SsoConfiguration,
  SsoProviderType,
  LdapConfig,
  SamlConfig,
} from '../entities/sso-configuration.entity';
import { LdapService, LdapUserAttributes } from './ldap.service';
import { SamlService, SamlUserAttributes } from './saml.service';
import { TokenPair, JwtPayload } from './iam.service';
import * as crypto from 'crypto';

@Injectable()
export class SsoService {
  private readonly logger = new Logger(SsoService.name);

  constructor(
    @InjectRepository(UserCredential)
    private readonly credentialRepo: Repository<UserCredential>,
    @InjectRepository(RefreshToken)
    private readonly refreshTokenRepo: Repository<RefreshToken>,
    @InjectRepository(SsoConfiguration)
    private readonly ssoConfigRepo: Repository<SsoConfiguration>,
    private readonly ldapService: LdapService,
    private readonly samlService: SamlService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
    private readonly events: EventEmitter2,
  ) {}

  // ── LDAP ────────────────────────────────────────────────────────────────────

  async ldapLogin(
    username: string,
    password: string,
    domain?: string,
    ipAddress?: string,
  ): Promise<TokenPair> {
    const ssoConfig = await this.findSsoConfig(SsoProviderType.LDAP, domain);
    const ldapConfig = ssoConfig.config as LdapConfig;

    const attrs = await this.ldapService.authenticate(username, password, ldapConfig);
    const credential = await this.provisionOrUpdate(SsoProviderType.LDAP, attrs.username, {
      email: attrs.email,
      displayName: attrs.displayName,
      groups: attrs.groups,
      rawAttrs: attrs.rawEntry,
    });

    return this.issueTokenPair(credential, ipAddress);
  }

  // ── SAML ────────────────────────────────────────────────────────────────────

  getSamlMetadata(configName?: string): string {
    // This is synchronous but requires config — load from cache or throw
    throw new NotFoundException(
      'SAML metadata requires a loaded configuration. Use GET /auth/saml/:name/metadata',
    );
  }

  async getSamlMetadataByName(name: string): Promise<string> {
    const ssoConfig = await this.ssoConfigRepo.findOne({
      where: { provider: SsoProviderType.SAML, name, enabled: true },
    });
    if (!ssoConfig) throw new NotFoundException(`SAML config "${name}" not found`);
    return this.samlService.generateMetadata(ssoConfig.config as SamlConfig);
  }

  async samlCallback(
    samlResponse: string,
    relayState?: string,
    ipAddress?: string,
  ): Promise<TokenPair> {
    // RelayState may carry the config name
    const configName = relayState ?? undefined;
    const ssoConfig = await this.findSsoConfig(SsoProviderType.SAML, configName);
    const samlConfig = ssoConfig.config as SamlConfig;

    let attrs: SamlUserAttributes;
    try {
      attrs = await this.samlService.validateResponse(samlResponse, samlConfig);
    } catch (err) {
      this.logger.warn(`SAML callback validation failed: ${(err as Error).message}`);
      throw new UnauthorizedException('SAML authentication failed');
    }

    const credential = await this.provisionOrUpdate(SsoProviderType.SAML, attrs.nameId, {
      email: attrs.email,
      displayName: attrs.displayName,
      groups: attrs.groups,
      rawAttrs: attrs.rawProfile,
    });

    return this.issueTokenPair(credential, ipAddress);
  }

  // ── JIT Provisioning ─────────────────────────────────────────────────────────

  /**
   * Find or create a UserCredential backed by an SSO provider.
   * On first login, creates a new credential with no password hash.
   * On subsequent logins, refreshes SSO attributes.
   */
  private async provisionOrUpdate(
    provider: SsoProviderType,
    subjectId: string,
    profile: {
      email: string;
      displayName: string;
      groups: string[];
      rawAttrs: any;
    },
  ): Promise<UserCredential> {
    let credential = await this.credentialRepo.findOne({
      where: { ssoProvider: provider, ssoSubjectId: subjectId },
    });

    if (!credential) {
      // JIT provisioning — first SSO login
      const username = this.deriveUsername(subjectId, profile.email);

      credential = this.credentialRepo.create({
        username,
        email: profile.email,
        passwordHash: '', // No local password — SSO-only account
        status: CredentialStatus.ACTIVE,
        ssoProvider: provider,
        ssoSubjectId: subjectId,
        ssoAttributes: { displayName: profile.displayName, groups: profile.groups, raw: profile.rawAttrs },
        ssoLinkedAt: new Date(),
      });

      credential = await this.credentialRepo.save(credential);

      this.events.emit('iam.sso.provisioned', {
        userId: credential.id,
        username: credential.username,
        provider,
        subjectId,
        timestamp: new Date(),
      });

      this.logger.log(`JIT-provisioned SSO user: ${credential.username} (${provider}/${subjectId})`);
    } else {
      // Refresh attributes on each login
      if (credential.status === CredentialStatus.SUSPENDED) {
        throw new UnauthorizedException('Account has been suspended');
      }

      credential.email = profile.email;
      credential.ssoAttributes = {
        displayName: profile.displayName,
        groups: profile.groups,
        raw: profile.rawAttrs,
      };
      credential.lastLoginAt = new Date();
      await this.credentialRepo.save(credential);

      this.events.emit('iam.sso.login', {
        userId: credential.id,
        username: credential.username,
        provider,
        timestamp: new Date(),
      });
    }

    return credential;
  }

  private async findSsoConfig(
    provider: SsoProviderType,
    name?: string,
  ): Promise<SsoConfiguration> {
    const where: any = { provider, enabled: true };
    if (name) where.name = name;

    const ssoConfig = await this.ssoConfigRepo.findOne({ where });
    if (!ssoConfig) {
      throw new NotFoundException(
        name
          ? `SSO configuration "${name}" not found or disabled`
          : `No enabled ${provider.toUpperCase()} configuration found`,
      );
    }

    return ssoConfig;
  }

  private async issueTokenPair(
    credential: UserCredential,
    ipAddress?: string,
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

    const rawRefreshToken = uuidv4() + uuidv4();
    const tokenHash = crypto.createHash('sha256').update(rawRefreshToken).digest('hex');
    const family = uuidv4();
    const refreshExpiresMs = this.parseExpiry(refreshExpiresIn);

    await this.refreshTokenRepo.save(
      this.refreshTokenRepo.create({
        userId: credential.id,
        tokenHash,
        family,
        expiresAt: new Date(Date.now() + refreshExpiresMs),
        ipAddress: ipAddress ?? null,
      }),
    );

    return {
      accessToken,
      refreshToken: rawRefreshToken,
      expiresIn: this.parseExpiry(accessExpiresIn) / 1000,
    };
  }

  /** Derive a local username from SSO subject ID and email */
  private deriveUsername(subjectId: string, email: string): string {
    // Prefer the local part of email, fallback to subjectId
    const localPart = email.split('@')[0];
    return (localPart ?? subjectId).toLowerCase().replace(/[^a-z0-9._-]/g, '_').slice(0, 100);
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
