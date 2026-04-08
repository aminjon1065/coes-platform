import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, AuthenticatedUser } from '../../iam/decorators/current-user.decorator';
import { AuthorizationService } from '../services/authorization.service';

@ApiTags('Authorization')
@ApiBearerAuth()
@Controller({ path: 'authorization/me', version: '1' })
export class PortalContextController {
  constructor(private readonly authorizationService: AuthorizationService) {}

  @Get('portal-context')
  @ApiOperation({ summary: 'Get effective portal roles, capabilities, and workspaces for the current user' })
  async getPortalContext(@CurrentUser() actor: AuthenticatedUser) {
    return this.authorizationService.getPortalContextForUser(actor.id);
  }
}
