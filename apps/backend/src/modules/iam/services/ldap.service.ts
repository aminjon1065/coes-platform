import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { Client, Entry } from 'ldapts';
import { LdapConfig } from '../entities/sso-configuration.entity';

export interface LdapUserAttributes {
  username: string;
  email: string;
  displayName: string;
  groups: string[];
  rawEntry: Entry;
}

@Injectable()
export class LdapService {
  private readonly logger = new Logger(LdapService.name);

  /**
   * Authenticate a user against LDAP and return their attributes.
   * Throws UnauthorizedException on bad credentials.
   */
  async authenticate(
    username: string,
    password: string,
    config: LdapConfig,
  ): Promise<LdapUserAttributes> {
    const client = this.buildClient(config);

    try {
      // Bind with service account to find user DN
      await client.bind(config.bindDn, config.bindPassword);

      const userEntry = await this.findUser(client, username, config);
      if (!userEntry) {
        throw new UnauthorizedException('User not found in directory');
      }

      // Re-bind as the user to verify password
      const userDn = userEntry.dn;
      await client.unbind();
      await client.bind(userDn, password);

      return this.mapAttributes(userEntry, config);
    } catch (err: any) {
      if (err instanceof UnauthorizedException) throw err;

      // LDAP invalid credentials error code
      if (err?.code === 49) {
        throw new UnauthorizedException('Invalid LDAP credentials');
      }

      this.logger.error(`LDAP authentication error: ${err?.message}`, err?.stack);
      throw new UnauthorizedException('LDAP authentication failed');
    } finally {
      try {
        await client.unbind();
      } catch {
        // ignore unbind errors
      }
    }
  }

  /**
   * Look up a user by username without re-authenticating (for JIT sync).
   * Uses service account bind.
   */
  async lookupUser(
    username: string,
    config: LdapConfig,
  ): Promise<LdapUserAttributes | null> {
    const client = this.buildClient(config);

    try {
      await client.bind(config.bindDn, config.bindPassword);
      const entry = await this.findUser(client, username, config);
      if (!entry) return null;
      return this.mapAttributes(entry, config);
    } catch (err: any) {
      this.logger.error(`LDAP lookup error for "${username}": ${err?.message}`);
      return null;
    } finally {
      try {
        await client.unbind();
      } catch {
        // ignore
      }
    }
  }

  private async findUser(
    client: Client,
    username: string,
    config: LdapConfig,
  ): Promise<Entry | null> {
    const filter = config.userSearchFilter.replace('{{username}}', this.escapeLdap(username));

    const { searchEntries } = await client.search(config.userSearchBase, {
      scope: 'sub',
      filter,
      attributes: [
        config.usernameAttribute,
        config.emailAttribute,
        config.displayNameAttribute,
        config.groupAttribute,
        'dn',
      ],
      sizeLimit: 1,
    });

    return searchEntries[0] ?? null;
  }

  private mapAttributes(entry: Entry, config: LdapConfig): LdapUserAttributes {
    const raw = (attr: string): string => {
      const val = entry[attr];
      if (Array.isArray(val)) return String(val[0] ?? '');
      return String(val ?? '');
    };

    const rawGroups = entry[config.groupAttribute];
    const groups: string[] = Array.isArray(rawGroups)
      ? rawGroups.map(String)
      : rawGroups
      ? [String(rawGroups)]
      : [];

    // Extract CN from each group DN: CN=GroupName,OU=...
    const groupNames = groups.map((dn) => {
      const match = dn.match(/^CN=([^,]+)/i);
      return match ? match[1] : dn;
    });

    return {
      username: raw(config.usernameAttribute),
      email: raw(config.emailAttribute),
      displayName: raw(config.displayNameAttribute),
      groups: groupNames,
      rawEntry: entry,
    };
  }

  private buildClient(config: LdapConfig): Client {
    return new Client({
      url: config.url,
      tlsOptions: config.tlsEnabled
        ? { rejectUnauthorized: config.tlsRejectUnauthorized }
        : undefined,
      timeout: 5000,
      connectTimeout: 5000,
    });
  }

  /** Escape special LDAP filter characters per RFC 4515 */
  private escapeLdap(value: string): string {
    return value
      .replace(/\\/g, '\\5c')
      .replace(/\*/g, '\\2a')
      .replace(/\(/g, '\\28')
      .replace(/\)/g, '\\29')
      .replace(/\0/g, '\\00');
  }
}
