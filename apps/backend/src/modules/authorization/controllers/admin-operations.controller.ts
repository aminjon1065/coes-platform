import { Controller, Get, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RequirePermission } from '../decorators/require-permission.decorator';
import { AdminOperationsService } from '../services/admin-operations.service';
import { AuthenticatedUser, CurrentUser } from '../../iam/decorators/current-user.decorator';

@ApiTags('Authorization / Admin')
@ApiBearerAuth()
@Controller({ path: 'authorization/admin', version: '1' })
export class AdminOperationsController {
  constructor(private readonly adminOperationsService: AdminOperationsService) {}

  @Get('operations')
  @RequirePermission('iam.user.read')
  @ApiOperation({ summary: 'Get operational control-plane snapshot for admin monitoring' })
  getOperations() {
    return this.adminOperationsService.getOperationsSnapshot();
  }

  @Post('operations/outbox/:eventId/replay')
  @RequirePermission('iam.user.update')
  @ApiOperation({ summary: 'Replay outbox event immediately' })
  replayOutbox(@Param('eventId') eventId: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.adminOperationsService.replayOutboxEvent(eventId, actor.id, actor.username);
  }

  @Post('operations/outbox/:eventId/mark-dead-letter')
  @RequirePermission('iam.user.update')
  @ApiOperation({ summary: 'Force outbox event into dead-letter state' })
  markOutboxDeadLetter(@Param('eventId') eventId: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.adminOperationsService.markOutboxDeadLetter(eventId, actor.id, actor.username);
  }

  @Post('operations/inbox/:messageId/retry')
  @RequirePermission('iam.user.update')
  @ApiOperation({ summary: 'Retry inbox message processing immediately' })
  retryInbox(@Param('messageId') messageId: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.adminOperationsService.retryInboxMessage(messageId, actor.id, actor.username);
  }

  @Post('operations/inbox/:messageId/reset')
  @RequirePermission('iam.user.update')
  @ApiOperation({ summary: 'Reset inbox message so it can be processed again' })
  resetInbox(@Param('messageId') messageId: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.adminOperationsService.resetInboxMessage(messageId, actor.id, actor.username);
  }
}
