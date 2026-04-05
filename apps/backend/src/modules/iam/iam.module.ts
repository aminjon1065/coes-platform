import { Module, Global } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { APP_GUARD } from '@nestjs/core';

import { UserCredential } from './entities/user-credential.entity';
import { RefreshToken } from './entities/refresh-token.entity';
import { IamService } from './services/iam.service';
import { JwtStrategy } from './strategies/jwt.strategy';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { AuthController } from './controllers/auth.controller';

@Global()
@Module({
  imports: [
    TypeOrmModule.forFeature([UserCredential, RefreshToken]),
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.register({}), // Configured dynamically per call in IamService
  ],
  controllers: [AuthController],
  providers: [
    IamService,
    JwtStrategy,
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
  ],
  exports: [IamService, JwtModule],
})
export class IamModule {}
