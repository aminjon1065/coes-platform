import { Injectable, Logger, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Inject } from '@nestjs/common';
import { Cache } from 'cache-manager';
import { IamService, JwtPayload } from '../services/iam.service';
import { MfaService } from '../services/mfa.service';
import { UsersService } from '../../users/services/users.service';
import { AssignmentType } from '../../users/entities/user-position-assignment.entity';
import { AuthenticatedUser } from '../decorators/current-user.decorator';

// TTL for per-credential context cache (seconds, passed to cache-manager set as ms)
const AUTH_CONTEXT_TTL_MS = 30_000;

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  private readonly logger = new Logger(JwtStrategy.name);

  constructor(
    config: ConfigService,
    private readonly iamService: IamService,
    private readonly mfaService: MfaService,
    private readonly usersService: UsersService,
    @Inject(CACHE_MANAGER) private readonly cache: Cache,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get<string>('jwt.accessSecret'),
    });
  }

  async validate(payload: JwtPayload & { scope?: string }): Promise<AuthenticatedUser> {
    // Reject MFA-pending tokens — they must not access protected endpoints.
    // They share the access secret but carry scope:'mfa_pending'.
    if (payload.scope === 'mfa_pending') {
      throw new UnauthorizedException('MFA verification required');
    }

    const cacheKey = `auth_ctx:${payload.sub}`;

    // Return cached context if fresh — avoids 4 DB queries per request
    const cached = await this.cache.get<AuthenticatedUser>(cacheKey);
    if (cached) {
      return cached;
    }

    const credential = await this.iamService.validateCredential(payload.sub);
    if (!credential) {
      throw new UnauthorizedException('User account is no longer active');
    }

    const { enabled: mfaEnabled } = await this.mfaService.getStatus(credential.id);
    let profileId: string | undefined;
    let clearance = 0;
    let positionId: string | undefined;

    try {
      const profile = await this.usersService.getProfileByCredentialId(credential.id);
      const assignments = await this.usersService.getActiveAssignments(profile.id);
      const primaryAssignment =
        assignments.find((a) => a.type === AssignmentType.PRIMARY) ?? assignments[0];

      profileId = profile.id;
      clearance = profile.clearanceLevel ?? 0;
      positionId = primaryAssignment?.positionId;
    } catch (error) {
      if (!(error instanceof NotFoundException)) {
        throw error;
      }
      this.logger.warn(
        `Credential ${credential.id} has no linked user profile; continuing with minimal auth context`,
      );
    }

    const context: AuthenticatedUser = {
      id: credential.id,
      sub: credential.id,
      username: credential.username,
      mfaEnabled,
      clearance,
      positionId,
      profileId,
    };

    await this.cache.set(cacheKey, context, AUTH_CONTEXT_TTL_MS);

    return context;
  }
}
