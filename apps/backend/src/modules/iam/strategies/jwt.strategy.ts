import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { IamService, JwtPayload } from '../services/iam.service';
import { MfaService } from '../services/mfa.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    config: ConfigService,
    private readonly iamService: IamService,
    private readonly mfaService: MfaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get<string>('jwt.accessSecret'),
    });
  }

  async validate(payload: JwtPayload) {
    const credential = await this.iamService.validateCredential(payload.sub);
    if (!credential) {
      throw new UnauthorizedException('User account is no longer active');
    }
    const { enabled: mfaEnabled } = await this.mfaService.getStatus(credential.id);
    return { id: credential.id, username: credential.username, mfaEnabled };
  }
}
