import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  Query,
  ParseUUIDPipe,
  HttpCode,
  HttpStatus,
  Req,
} from '@nestjs/common';
import { FastifyRequest } from 'fastify';
import { NotificationService } from '../services/notification.service';
import { ListNotificationsDto } from '../dto/list-notifications.dto';
import { UpdatePreferenceDto } from '../dto/update-preference.dto';

interface AuthenticatedRequest extends FastifyRequest {
  user: {
    sub: string;
    clearance: number;
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

  // ─── Inbox ────────────────────────────────────────────────────────────────────

  @Get()
  listNotifications(
    @Query() query: ListNotificationsDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.notificationService.listForUser(
      req.user.sub,
      req.user.positionId!,
      query,
    );
  }

  @Patch(':id/read')
  @HttpCode(HttpStatus.NO_CONTENT)
  markRead(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.notificationService.markRead(id, req.user.sub);
  }

  @Post('read-all')
  @HttpCode(HttpStatus.OK)
  markAllRead(@Req() req: AuthenticatedRequest) {
    return this.notificationService.markAllRead(req.user.sub);
  }

  // ─── Delivery status (2.6.7) ──────────────────────────────────────────────────

  @Get(':id/delivery')
  getDeliveryStatus(@Param('id', ParseUUIDPipe) id: string) {
    return this.notificationService.getDeliveryStatus(id);
  }

  // ─── Preferences (2.6.5) ──────────────────────────────────────────────────────

  @Get('preferences')
  getPreferences(@Req() req: AuthenticatedRequest) {
    return this.notificationService.getPreferences(req.user.sub);
  }

  @Patch('preferences')
  updatePreference(
    @Body() dto: UpdatePreferenceDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.notificationService.updatePreference(req.user.sub, dto);
  }
}
