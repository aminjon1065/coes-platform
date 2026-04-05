import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { AuditService } from '../../audit/services/audit.service';

@Injectable()
export class UsersAuditListener {
  constructor(private readonly audit: AuditService) {}

  @OnEvent('users.profile.created')
  async onProfileCreated(payload: {
    userId: string;
    credentialId: string;
    requestedBy?: string;
  }) {
    await this.audit.emit({
      actorId: payload.requestedBy,
      eventType: 'users.profile.created',
      resourceType: 'user_profile',
      resourceId: payload.userId,
      metadata: { credentialId: payload.credentialId },
    });
  }

  @OnEvent('users.profile.updated')
  async onProfileUpdated(payload: {
    userId: string;
    changes: Record<string, unknown>;
    requestedBy?: string;
  }) {
    await this.audit.emit({
      actorId: payload.requestedBy,
      eventType: 'users.profile.updated',
      resourceType: 'user_profile',
      resourceId: payload.userId,
      metadata: { fields: Object.keys(payload.changes) },
    });
  }

  @OnEvent('users.position.assigned')
  async onPositionAssigned(payload: {
    userId: string;
    positionId: string;
    assignmentId: string;
    type: string;
    departmentId: string;
  }) {
    await this.audit.emit({
      actorId: payload.userId,
      eventType: 'users.position.assigned',
      resourceType: 'user_position_assignment',
      resourceId: payload.assignmentId,
      metadata: {
        positionId: payload.positionId,
        type: payload.type,
        departmentId: payload.departmentId,
      },
    });
  }

  @OnEvent('users.position.vacated')
  async onPositionVacated(payload: {
    userId: string;
    positionId: string;
    assignmentId: string;
    reason?: string;
  }) {
    await this.audit.emit({
      actorId: payload.userId,
      eventType: 'users.position.vacated',
      resourceType: 'user_position_assignment',
      resourceId: payload.assignmentId,
      metadata: { positionId: payload.positionId, reason: payload.reason },
    });
  }

  @OnEvent('users.profile.offboarded')
  async onOffboarded(payload: { userId: string; requestedBy?: string }) {
    await this.audit.emit({
      actorId: payload.requestedBy,
      eventType: 'users.profile.offboarded',
      resourceType: 'user_profile',
      resourceId: payload.userId,
    });
  }
}
