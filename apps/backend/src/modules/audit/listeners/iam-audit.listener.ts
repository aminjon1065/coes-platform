import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { AuditService } from '../services/audit.service';
import { AuditSeverity } from '../entities/audit-event.entity';

@Injectable()
export class IamAuditListener {
  constructor(private readonly audit: AuditService) {}

  @OnEvent('iam.user.registered')
  async onRegistered(payload: { userId: string; username: string; requestedBy?: string }) {
    await this.audit.emit({
      actorId: payload.requestedBy,
      eventType: 'iam.user.registered',
      resourceType: 'user_credential',
      resourceId: payload.userId,
      metadata: { username: payload.username },
    });
  }

  @OnEvent('iam.user.login')
  async onLogin(payload: { userId: string; username: string; ipAddress?: string }) {
    await this.audit.emit({
      actorId: payload.userId,
      actorUsername: payload.username,
      eventType: 'iam.user.login',
      resourceType: 'session',
      ipAddress: payload.ipAddress,
    });
  }

  @OnEvent('iam.user.locked')
  async onLocked(payload: { userId: string; username: string }) {
    await this.audit.emit({
      actorId: payload.userId,
      actorUsername: payload.username,
      eventType: 'iam.user.locked',
      resourceType: 'user_credential',
      resourceId: payload.userId,
      severity: AuditSeverity.WARNING,
      metadata: { reason: 'max_failed_attempts' },
    });
  }

  @OnEvent('iam.token.reuse_detected')
  async onTokenReuse(payload: { userId: string; family: string; ipAddress?: string }) {
    await this.audit.emit({
      actorId: payload.userId,
      eventType: 'iam.token.reuse_detected',
      resourceType: 'refresh_token',
      ipAddress: payload.ipAddress,
      severity: AuditSeverity.CRITICAL,
      metadata: { family: payload.family },
    });
  }
}
