import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum SsoProviderType {
  LDAP = 'ldap',
  SAML = 'saml',
}

export interface LdapConfig {
  url: string;          // ldap://ad.example.gov.tj:389
  baseDn: string;       // DC=example,DC=gov,DC=tj
  bindDn: string;       // CN=svc-coescd,OU=ServiceAccounts,DC=example,DC=gov,DC=tj
  bindPassword: string;
  userSearchBase: string;  // OU=Users,DC=example,DC=gov,DC=tj
  userSearchFilter: string; // (sAMAccountName={{username}})
  groupSearchBase?: string;
  groupSearchFilter?: string; // (&(objectClass=group)(member={{dn}}))
  usernameAttribute: string;  // sAMAccountName
  emailAttribute: string;     // mail
  displayNameAttribute: string; // displayName
  groupAttribute: string;     // memberOf
  tlsEnabled: boolean;
  tlsRejectUnauthorized: boolean;
}

export interface SamlConfig {
  entryPoint: string;    // IdP SSO URL
  issuer: string;        // SP entity ID (our app)
  cert: string;          // IdP public certificate (PEM)
  callbackUrl: string;   // SP ACS URL
  identifierFormat?: string;
  privateKey?: string;   // SP signing key (PEM)
  privateCert?: string;  // SP signing cert (PEM)
  signatureAlgorithm?: string;
  digestAlgorithm?: string;
  usernameAttribute: string; // SAML attribute mapping
  emailAttribute: string;
  displayNameAttribute: string;
  groupsAttribute?: string;
}

@Entity({ name: 'sso_configurations', schema: 'iam' })
export class SsoConfiguration {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 50 })
  provider: SsoProviderType;

  @Column({ length: 100 })
  name: string;

  @Column({ default: true })
  enabled: boolean;

  @Column({ type: 'jsonb', default: '{}' })
  config: LdapConfig | SamlConfig;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
