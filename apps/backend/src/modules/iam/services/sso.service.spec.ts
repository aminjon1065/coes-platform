import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { NotFoundException, UnauthorizedException } from '@nestjs/common';

import { SsoService } from './sso.service';
import { LdapService } from './ldap.service';
import { SamlService } from './saml.service';
import { UserCredential, CredentialStatus } from '../entities/user-credential.entity';
import { RefreshToken } from '../entities/refresh-token.entity';
import { SsoConfiguration, SsoProviderType } from '../entities/sso-configuration.entity';

// ── Helpers ──────────────────────────────────────────────────────────────────

const uid = () => require('crypto').randomUUID();

function makeRepo<T>(extra: Partial<Record<string, jest.Mock>> = {}) {
  return {
    findOne: jest.fn(),
    find: jest.fn(),
    create: jest.fn((d: any) => ({ ...d })),
    save: jest.fn(async (d: any) => ({ id: uid(), ...d })),
    update: jest.fn(),
    ...extra,
  };
}

const LDAP_CONFIG = {
  url: 'ldap://ad.test.gov.tj:389',
  baseDn: 'DC=test,DC=gov,DC=tj',
  bindDn: 'CN=svc,DC=test,DC=gov,DC=tj',
  bindPassword: 'secret',
  userSearchBase: 'OU=Users,DC=test,DC=gov,DC=tj',
  userSearchFilter: '(sAMAccountName={{username}})',
  usernameAttribute: 'sAMAccountName',
  emailAttribute: 'mail',
  displayNameAttribute: 'displayName',
  groupAttribute: 'memberOf',
  tlsEnabled: false,
  tlsRejectUnauthorized: false,
};

const SAML_CONFIG = {
  entryPoint: 'https://idp.test.gov.tj/sso',
  issuer: 'https://coescd.gov.tj',
  cert: 'MOCK_CERT',
  callbackUrl: 'https://coescd.gov.tj/auth/saml/acs',
  usernameAttribute: 'uid',
  emailAttribute: 'email',
  displayNameAttribute: 'displayName',
};

const LDAP_ATTRS = {
  username: 'john.doe',
  email: 'john.doe@test.gov.tj',
  displayName: 'John Doe',
  groups: ['Operators', 'FieldTeam'],
  rawEntry: { dn: 'CN=John Doe,OU=Users,DC=test,DC=gov,DC=tj' },
};

const SAML_ATTRS = {
  nameId: 'john.doe@idp.test.gov.tj',
  email: 'john.doe@test.gov.tj',
  displayName: 'John Doe',
  groups: ['Operators'],
  sessionIndex: 'sess_123',
  rawProfile: {},
};

const MOCK_CREDENTIAL: UserCredential = {
  id: 'cred-1',
  username: 'john.doe',
  email: 'john.doe@test.gov.tj',
  passwordHash: '',
  status: CredentialStatus.ACTIVE,
  failedAttempts: 0,
  lockedUntil: null,
  lastLoginAt: null,
  passwordChangedAt: null,
  isServiceAccount: false,
  ssoProvider: SsoProviderType.LDAP,
  ssoSubjectId: 'john.doe',
  ssoAttributes: null,
  ssoLinkedAt: new Date(),
  createdAt: new Date(),
  updatedAt: new Date(),
};

// ── Test suite ────────────────────────────────────────────────────────────────

describe('SsoService', () => {
  let service: SsoService;
  let credRepo: ReturnType<typeof makeRepo>;
  let refreshRepo: ReturnType<typeof makeRepo>;
  let ssoConfigRepo: ReturnType<typeof makeRepo>;
  let ldapService: jest.Mocked<LdapService>;
  let samlService: jest.Mocked<SamlService>;
  let events: jest.Mocked<EventEmitter2>;

  beforeEach(async () => {
    credRepo = makeRepo();
    refreshRepo = makeRepo();
    ssoConfigRepo = makeRepo();

    ldapService = {
      authenticate: jest.fn(),
      lookupUser: jest.fn(),
    } as any;

    samlService = {
      generateMetadata: jest.fn(),
      validateResponse: jest.fn(),
    } as any;

    events = { emit: jest.fn() } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SsoService,
        { provide: getRepositoryToken(UserCredential), useValue: credRepo },
        { provide: getRepositoryToken(RefreshToken), useValue: refreshRepo },
        { provide: getRepositoryToken(SsoConfiguration), useValue: ssoConfigRepo },
        { provide: LdapService, useValue: ldapService },
        { provide: SamlService, useValue: samlService },
        {
          provide: JwtService,
          useValue: { sign: jest.fn(() => 'mock.jwt.token') },
        },
        {
          provide: ConfigService,
          useValue: { get: jest.fn((k: string, d: any) => d ?? '15m') },
        },
        { provide: EventEmitter2, useValue: events },
      ],
    }).compile();

    service = module.get(SsoService);
  });

  // ── LDAP login ─────────────────────────────────────────────────────────────

  describe('ldapLogin', () => {
    const ldapSsoConfig = {
      id: 'cfg-1',
      provider: SsoProviderType.LDAP,
      name: 'CoESCD AD',
      enabled: true,
      config: LDAP_CONFIG,
    };

    it('authenticates and provisions a new user on first login', async () => {
      ssoConfigRepo.findOne.mockResolvedValue(ldapSsoConfig);
      ldapService.authenticate.mockResolvedValue(LDAP_ATTRS);
      credRepo.findOne.mockResolvedValue(null); // not provisioned yet
      credRepo.save.mockResolvedValue({ ...MOCK_CREDENTIAL, id: uid() });

      const result = await service.ldapLogin('john.doe', 'Password1!', undefined, '10.0.0.1');

      expect(ldapService.authenticate).toHaveBeenCalledWith('john.doe', 'Password1!', LDAP_CONFIG);
      expect(credRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          username: 'john.doe',
          email: LDAP_ATTRS.email,
          ssoProvider: SsoProviderType.LDAP,
          ssoSubjectId: 'john.doe',
        }),
      );
      expect(events.emit).toHaveBeenCalledWith('iam.sso.provisioned', expect.any(Object));
      expect(result).toHaveProperty('accessToken', 'mock.jwt.token');
      expect(result).toHaveProperty('refreshToken');
    });

    it('refreshes attributes and issues tokens for an existing user', async () => {
      ssoConfigRepo.findOne.mockResolvedValue(ldapSsoConfig);
      ldapService.authenticate.mockResolvedValue(LDAP_ATTRS);
      credRepo.findOne.mockResolvedValue(MOCK_CREDENTIAL);

      await service.ldapLogin('john.doe', 'Password1!');

      expect(credRepo.create).not.toHaveBeenCalled();
      expect(credRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          id: MOCK_CREDENTIAL.id,
          email: LDAP_ATTRS.email,
        }),
      );
      expect(events.emit).toHaveBeenCalledWith('iam.sso.login', expect.any(Object));
    });

    it('throws NotFoundException when no LDAP config found', async () => {
      ssoConfigRepo.findOne.mockResolvedValue(null);

      await expect(service.ldapLogin('user', 'pass')).rejects.toThrow(NotFoundException);
    });

    it('propagates UnauthorizedException from LdapService', async () => {
      ssoConfigRepo.findOne.mockResolvedValue(ldapSsoConfig);
      ldapService.authenticate.mockRejectedValue(new UnauthorizedException('Invalid LDAP credentials'));

      await expect(service.ldapLogin('user', 'wrong')).rejects.toThrow(UnauthorizedException);
    });

    it('throws ForbiddenException for suspended accounts', async () => {
      ssoConfigRepo.findOne.mockResolvedValue(ldapSsoConfig);
      ldapService.authenticate.mockResolvedValue(LDAP_ATTRS);
      credRepo.findOne.mockResolvedValue({
        ...MOCK_CREDENTIAL,
        status: CredentialStatus.SUSPENDED,
      });

      await expect(service.ldapLogin('john.doe', 'Password1!')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('creates refresh token record on successful login', async () => {
      ssoConfigRepo.findOne.mockResolvedValue(ldapSsoConfig);
      ldapService.authenticate.mockResolvedValue(LDAP_ATTRS);
      credRepo.findOne.mockResolvedValue(MOCK_CREDENTIAL);

      await service.ldapLogin('john.doe', 'Password1!', undefined, '192.168.1.10');

      expect(refreshRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: MOCK_CREDENTIAL.id,
          ipAddress: '192.168.1.10',
        }),
      );
    });

    it('selects the correct LDAP config when domain is provided', async () => {
      ssoConfigRepo.findOne.mockResolvedValue(ldapSsoConfig);
      ldapService.authenticate.mockResolvedValue(LDAP_ATTRS);
      credRepo.findOne.mockResolvedValue(MOCK_CREDENTIAL);

      await service.ldapLogin('john.doe', 'pass', 'CoESCD AD');

      expect(ssoConfigRepo.findOne).toHaveBeenCalledWith({
        where: { provider: SsoProviderType.LDAP, enabled: true, name: 'CoESCD AD' },
      });
    });
  });

  // ── SAML ───────────────────────────────────────────────────────────────────

  describe('samlCallback', () => {
    const samlSsoConfig = {
      id: 'cfg-2',
      provider: SsoProviderType.SAML,
      name: 'default',
      enabled: true,
      config: SAML_CONFIG,
    };

    it('provisions a new user from SAML assertion', async () => {
      ssoConfigRepo.findOne.mockResolvedValue(samlSsoConfig);
      samlService.validateResponse.mockResolvedValue(SAML_ATTRS);
      credRepo.findOne.mockResolvedValue(null);
      credRepo.save.mockResolvedValue({ ...MOCK_CREDENTIAL, id: uid() });

      const result = await service.samlCallback('RAW_SAML_RESPONSE', undefined, '10.0.0.2');

      expect(samlService.validateResponse).toHaveBeenCalledWith('RAW_SAML_RESPONSE', SAML_CONFIG);
      expect(credRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          ssoProvider: SsoProviderType.SAML,
          ssoSubjectId: SAML_ATTRS.nameId,
        }),
      );
      expect(events.emit).toHaveBeenCalledWith('iam.sso.provisioned', expect.any(Object));
      expect(result).toHaveProperty('accessToken', 'mock.jwt.token');
    });

    it('throws UnauthorizedException when SAML validation fails', async () => {
      ssoConfigRepo.findOne.mockResolvedValue(samlSsoConfig);
      samlService.validateResponse.mockRejectedValue(
        new UnauthorizedException('Invalid SAML response'),
      );

      await expect(service.samlCallback('BAD_RESPONSE')).rejects.toThrow(UnauthorizedException);
    });

    it('uses RelayState to select SAML config', async () => {
      ssoConfigRepo.findOne.mockResolvedValue(samlSsoConfig);
      samlService.validateResponse.mockResolvedValue(SAML_ATTRS);
      credRepo.findOne.mockResolvedValue(MOCK_CREDENTIAL);

      await service.samlCallback('SAML_RESPONSE', 'my-idp');

      expect(ssoConfigRepo.findOne).toHaveBeenCalledWith({
        where: { provider: SsoProviderType.SAML, enabled: true, name: 'my-idp' },
      });
    });
  });

  // ── SAML metadata ──────────────────────────────────────────────────────────

  describe('getSamlMetadataByName', () => {
    it('returns metadata XML for a valid config', async () => {
      ssoConfigRepo.findOne.mockResolvedValue({
        provider: SsoProviderType.SAML,
        name: 'default',
        enabled: true,
        config: SAML_CONFIG,
      });
      samlService.generateMetadata.mockReturnValue('<EntityDescriptor>…</EntityDescriptor>');

      const xml = await service.getSamlMetadataByName('default');

      expect(xml).toContain('EntityDescriptor');
    });

    it('throws NotFoundException when config does not exist', async () => {
      ssoConfigRepo.findOne.mockResolvedValue(null);

      await expect(service.getSamlMetadataByName('nonexistent')).rejects.toThrow(NotFoundException);
    });
  });

  // ── JIT provisioning edge cases ────────────────────────────────────────────

  describe('JIT username derivation', () => {
    it('uses email local part as username', async () => {
      const ldapSsoConfig = {
        provider: SsoProviderType.LDAP,
        name: 'test',
        enabled: true,
        config: LDAP_CONFIG,
      };
      ssoConfigRepo.findOne.mockResolvedValue(ldapSsoConfig);
      ldapService.authenticate.mockResolvedValue({
        ...LDAP_ATTRS,
        email: 'fatima.nazarova@coescd.gov.tj',
        username: 'fnazarova',
      });
      credRepo.findOne.mockResolvedValue(null);
      credRepo.save.mockResolvedValue({ ...MOCK_CREDENTIAL, id: uid() });

      await service.ldapLogin('fnazarova', 'Password1!');

      expect(credRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ username: 'fatima.nazarova' }),
      );
    });

    it('sanitizes special characters in derived username', async () => {
      const ldapSsoConfig = {
        provider: SsoProviderType.LDAP,
        name: 'test',
        enabled: true,
        config: LDAP_CONFIG,
      };
      ssoConfigRepo.findOne.mockResolvedValue(ldapSsoConfig);
      ldapService.authenticate.mockResolvedValue({
        ...LDAP_ATTRS,
        email: 'user+test@coescd.gov.tj',
      });
      credRepo.findOne.mockResolvedValue(null);
      credRepo.save.mockResolvedValue({ ...MOCK_CREDENTIAL, id: uid() });

      await service.ldapLogin('user', 'pass');

      const createCall = credRepo.create.mock.calls[0][0];
      // The '+' should be replaced with '_'
      expect(createCall.username).toMatch(/^[a-z0-9._\-_]+$/);
    });
  });
});
