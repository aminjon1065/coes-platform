import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  ParseUUIDPipe,
  HttpCode,
  HttpStatus,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import { FastifyRequest } from 'fastify';
import { NotificationService } from '../services/notification.service';
import { ListNotificationsDto } from '../dto/list-notifications.dto';
import { UpdatePreferenceDto } from '../dto/update-preference.dto';
import { RegisterPushSubscriptionDto } from '../dto/register-push-subscription.dto';
import { DeletePushSubscriptionDto } from '../dto/delete-push-subscription.dto';
import { RegisterTelegramSubscriptionDto } from '../dto/register-telegram-subscription.dto';

interface AuthenticatedRequest extends FastifyRequest {
  user: {
    sub?: string;
    id?: string;
    clearance?: number;
    positionId?: string;
  };
}

/**
 * 2.6.2 — Notification REST API.
 *
 * Endpoints:
 *   GET  /notifications              — list inbox (with unread count)
 *   PATCH /notifications/:id/read   — mark single notification read
 *   POST  /notifications/read-all   — mark all read
 *   GET  /notifications/:id/delivery — delivery status for a notification
 *   GET  /notifications/preferences  — get delivery preferences
 *   PATCH /notifications/preferences — update delivery preferences
 */
@Controller('notifications')
export class NotificationController {
  constructor(private readonly notificationService: NotificationService) {}

  private getCredentialId(req: AuthenticatedRequest): string {
    const userId = req.user?.sub ?? req.user?.id;
    if (!userId) {
      throw new UnauthorizedException('Authenticated credential context is missing');
    }
    return userId;
  }

  // ─── Inbox ────────────────────────────────────────────────────────────────────

  @Get()
  listNotifications(
    @Query() query: ListNotificationsDto,
    @Req() req: AuthenticatedRequest,
  ) {
    const userId = this.getCredentialId(req);
    return this.notificationService.listForUser(
      userId,
      req.user.positionId ?? userId,
      query,
    );
  }

  @Patch(':id/read')
  @HttpCode(HttpStatus.NO_CONTENT)
  markRead(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.notificationService.markRead(id, this.getCredentialId(req));
  }

  @Post('read-all')
  @HttpCode(HttpStatus.OK)
  markAllRead(@Req() req: AuthenticatedRequest) {
    return this.notificationService.markAllRead(this.getCredentialId(req));
  }

  // ─── Delivery status (2.6.7) ──────────────────────────────────────────────────

  @Get(':id/delivery')
  getDeliveryStatus(@Param('id', ParseUUIDPipe) id: string) {
    return this.notificationService.getDeliveryStatus(id);
  }

  // ─── Preferences (2.6.5) ──────────────────────────────────────────────────────

  @Get('preferences')
  getPreferences(@Req() req: AuthenticatedRequest) {
    return this.notificationService.getPreferences(this.getCredentialId(req));
  }

  @Patch('preferences')
  updatePreference(
    @Body() dto: UpdatePreferenceDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.notificationService.updatePreference(this.getCredentialId(req), dto);
  }

  // ─── Web Push subscriptions ───────────────────────────────────────────────────

  @Get('push-subscription')
  listPushSubscriptions(@Req() req: AuthenticatedRequest) {
    return this.notificationService.listPushSubscriptions(this.getCredentialId(req));
  }

  @Post('push-subscription')
  @HttpCode(HttpStatus.CREATED)
  registerPushSubscription(
    @Body() dto: RegisterPushSubscriptionDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.notificationService.registerPushSubscription(
      this.getCredentialId(req),
      dto,
      req.headers['user-agent'] ?? null,
    );
  }

  @Delete('push-subscription')
  @HttpCode(HttpStatus.NO_CONTENT)
  removePushSubscription(
    @Body() dto: DeletePushSubscriptionDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.notificationService.removePushSubscription(
      this.getCredentialId(req),
      dto.endpoint,
    );
  }

  @Get('telegram-subscription')
  getTelegramSubscription(@Req() req: AuthenticatedRequest) {
    return this.notificationService.getTelegramSubscription(this.getCredentialId(req));
  }

  @Post('telegram-subscription')
  @HttpCode(HttpStatus.CREATED)
  registerTelegramSubscription(
    @Body() dto: RegisterTelegramSubscriptionDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.notificationService.registerTelegramSubscription(
      this.getCredentialId(req),
      dto,
    );
  }

  @Delete('telegram-subscription')
  @HttpCode(HttpStatus.NO_CONTENT)
  removeTelegramSubscription(@Req() req: AuthenticatedRequest) {
    return this.notificationService.removeTelegramSubscription(this.getCredentialId(req));
  }
}
