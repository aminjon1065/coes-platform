import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PERMISSION_KEY } from '../decorators/require-permission.decorator';
import { AuthorizationService } from '../services/authorization.service';
import { AuthenticatedUser } from '../../iam/decorators/current-user.decorator';

@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly authz: AuthorizationService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const permission = this.reflector.getAllAndOverride<string>(PERMISSION_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!permission) return true; // No permission requirement on this route

    const request = context.switchToHttp().getRequest();
    const user = request.user as AuthenticatedUser;

    if (!user) throw new ForbiddenException('Authentication required');

    const departmentId = request.params?.departmentId ?? request.query?.departmentId;

    const decision = await this.authz.can(permission, {
      userId: user.id,
      departmentId,
    });

    if (!decision.allowed) {
      throw new ForbiddenException(
        `Access denied: ${decision.reason}`,
      );
    }

    return true;
  }
}
