import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { SAML } from '@node-saml/node-saml';
import { SamlConfig } from '../entities/sso-configuration.entity';

export interface SamlUserAttributes {
  nameId: string;       // Stable subject identifier
  email: string;
  displayName: string;
  groups: string[];
  sessionIndex?: string;
  rawProfile: Record<string, any>;
}

@Injectable()
export class SamlService {
  private readonly logger = new Logger(SamlService.name);

  /**
   * Generate SAML SP metadata XML for a given configuration.
   * Sent to the IdP administrator for SP registration.
   */
  generateMetadata(config: SamlConfig): string {
    const saml = this.buildSaml(config);
    return saml.generateServiceProviderMetadata(
      config.privateCert ?? null,
      config.privateCert ?? null,
    );
  }

  /**
   * Validate a SAML response (from ACS POST) and extract user attributes.
   */
  async validateResponse(
    samlResponse: string,
    config: SamlConfig,
  ): Promise<SamlUserAttributes> {
    const saml = this.buildSaml(config);

    let profile: any;
    try {
      const result = await saml.validatePostResponseAsync({
        SAMLResponse: samlResponse,
      });
      profile = result.profile;
    } catch (err: any) {
      this.logger.warn(`SAML response validation failed: ${err?.message}`);
      throw new UnauthorizedException('Invalid SAML response');
    }

    if (!profile) {
      throw new UnauthorizedException('No profile in SAML assertion');
    }

    return this.mapProfile(profile, config);
  }

  private mapProfile(profile: any, config: SamlConfig): SamlUserAttributes {
    const attr = (key: string): string => {
      const val = profile[key] ?? profile.attributes?.[key];
      if (Array.isArray(val)) return String(val[0] ?? '');
      return String(val ?? '');
    };

    const rawGroups = profile[config.groupsAttribute ?? ''] ?? profile.attributes?.[config.groupsAttribute ?? ''];
    const groups: string[] = Array.isArray(rawGroups)
      ? rawGroups.map(String)
      : rawGroups
      ? [String(rawGroups)]
      : [];

    return {
      nameId: profile.nameID ?? profile.nameId ?? attr(config.usernameAttribute),
      email: attr(config.emailAttribute),
      displayName: attr(config.displayNameAttribute),
      groups,
      sessionIndex: profile.sessionIndex,
      rawProfile: profile,
    };
  }

  private buildSaml(config: SamlConfig): SAML {
    return new SAML({
      entryPoint: config.entryPoint,
      issuer: config.issuer,
      idpCert: config.cert,
      callbackUrl: config.callbackUrl,
      identifierFormat: config.identifierFormat ?? 'urn:oasis:names:tc:SAML:1.1:nameid-format:unspecified',
      privateKey: config.privateKey,
      signatureAlgorithm: (config.signatureAlgorithm ?? 'sha256') as any,
      digestAlgorithm: (config.digestAlgorithm ?? 'sha256') as any,
      validateInResponseTo: 'never' as any,
      disableRequestedAuthnContext: true,
      wantAssertionsSigned: true,
    });
  }
}
