import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as crypto from 'crypto';
import { AuditEvent, AuditSeverity } from '../entities/audit-event.entity';

export interface EmitAuditEventDto {
  actorId?: string;
  actorUsername?: string;
  eventType?: string;
  action?: string;
  resourceType?: string;
  resourceId?: string;
  ipAddress?: string;
  userAgent?: string;
  success?: boolean;
  failureReason?: string;
  severity?: AuditSeverity;
  metadata?: Record<string, unknown>;
  details?: Record<string, unknown>;
  meta?: Record<string, unknown>;
}

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(
    @InjectRepository(AuditEvent)
    private readonly auditRepo: Repository<AuditEvent>,
  ) {}

  async emit(dto: EmitAuditEventDto): Promise<void> {
    try {
      const eventType = dto.eventType ?? dto.action;
      if (!eventType) {
        this.logger.warn('Skipping audit event with no eventType/action');
        return;
      }

      const event = this.auditRepo.create({
        actorId: dto.actorId ?? null,
        actorUsername: dto.actorUsername ?? null,
        eventType,
        resourceType: dto.resourceType ?? null,
        resourceId: dto.resourceId ?? null,
        ipAddress: dto.ipAddress ?? null,
        userAgent: dto.userAgent ?? null,
        success: dto.success ?? true,
        failureReason: dto.failureReason ?? null,
        severity: dto.severity ?? AuditSeverity.INFO,
        metadata: dto.metadata ?? dto.details ?? dto.meta ?? null,
      });

      // Compute integrity hash before save (id not yet known; use a nonce)
      const nonce = crypto.randomBytes(16).toString('hex');
      event.integrityHash = this.computeHash(nonce, eventType, dto.actorId ?? '');

      await this.auditRepo.save(event);
    } catch (err) {
      // Audit failures must never break the primary operation.
      // Log loudly so that ops can detect an audit pipeline issue.
      this.logger.error('Failed to persist audit event', err);
    }
  }

  async queryEvents(filters: {
    actorId?: string;
    eventType?: string;
    resourceType?: string;
    resourceId?: string;
    from?: Date;
    to?: Date;
    limit?: number;
    offset?: number;
  }): Promise<[AuditEvent[], number]> {
    const qb = this.auditRepo.createQueryBuilder('e');

    if (filters.actorId) qb.andWhere('e.actor_id = :actorId', { actorId: filters.actorId });
    if (filters.eventType) qb.andWhere('e.event_type = :eventType', { eventType: filters.eventType });
    if (filters.resourceType) qb.andWhere('e.resource_type = :resourceType', { resourceType: filters.resourceType });
    if (filters.resourceId) qb.andWhere('e.resource_id = :resourceId', { resourceId: filters.resourceId });
    if (filters.from) qb.andWhere('e.occurred_at >= :from', { from: filters.from });
    if (filters.to) qb.andWhere('e.occurred_at <= :to', { to: filters.to });

    qb.orderBy('e.occurred_at', 'DESC')
      .limit(filters.limit ?? 50)
      .offset(filters.offset ?? 0);

    return qb.getManyAndCount();
  }

  private computeHash(nonce: string, eventType: string, actorId: string): string {
    return crypto
      .createHash('sha256')
      .update(`${nonce}|${eventType}|${actorId}|${Date.now()}`)
      .digest('hex');
  }
}
