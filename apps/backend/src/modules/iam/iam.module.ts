import { Module, Global } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { APP_GUARD } from '@nestjs/core';

import { UserCredential } from './entities/user-credential.entity';
import { RefreshToken } from './entities/refresh-token.entity';
import { SsoConfiguration } from './entities/sso-configuration.entity';
import { MfaCredential } from './entities/mfa-credential.entity';
import { IamService } from './services/iam.service';
import { MfaService } from './services/mfa.service';
import { LdapService } from './services/ldap.service';
import { SamlService } from './services/saml.service';
import { SsoService } from './services/sso.service';
import { JwtStrategy } from './strategies/jwt.strategy';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { AuthController } from './controllers/auth.controller';
import { MfaController } from './controllers/mfa.controller';
import { SsoController } from './controllers/sso.controller';
import { UsersModule } from '../users/users.module';

@Global()
@Module({
  imports: [
    TypeOrmModule.forFeature([UserCredential, RefreshToken, SsoConfiguration, MfaCredential]),
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.register({}), // Configured dynamically per call in IamService
    UsersModule,
  ],
  controllers: [AuthController, MfaController, SsoController],
  providers: [
    IamService,
    MfaService,
    LdapService,
    SamlService,
    SsoService,
    JwtStrategy,
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
  ],
  exports: [IamService, MfaService, SsoService, JwtModule],
})
export class IamModule {}
