import { Repository } from 'typeorm';
import { AuditService } from './audit.service';
import { AuditEvent, AuditSeverity } from '../entities/audit-event.entity';

function makeQb(results: AuditEvent[] = [], count = 0) {
  return {
    andWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    offset: jest.fn().mockReturnThis(),
    getManyAndCount: jest.fn().mockResolvedValue([results, count]),
  };
}

function mockRepo(): jest.Mocked<Repository<AuditEvent>> {
  const qb = makeQb();
  return {
    create: jest.fn((dto: Partial<AuditEvent>) => ({ ...dto }) as AuditEvent),
    save: jest.fn().mockResolvedValue({}),
    createQueryBuilder: jest.fn().mockReturnValue(qb),
    _qb: qb,
  } as unknown as jest.Mocked<Repository<AuditEvent>>;
}

describe('AuditService', () => {
  let service: AuditService;
  let auditRepo: jest.Mocked<Repository<AuditEvent>>;

  beforeEach(() => {
    auditRepo = mockRepo();
    service   = new AuditService(auditRepo as any);
  });

  // ── emit ──────────────────────────────────────────────────────────────────

  describe('emit', () => {
    it('persists audit event with correct fields', async () => {
      await service.emit({
        actorId:       'user-1',
        actorUsername: 'analyst01',
        eventType:     'incidents:create',
        resourceType:  'incident',
        resourceId:    'inc-1',
        ipAddress:     '10.0.0.1',
        success:       true,
        severity:      AuditSeverity.INFO,
        metadata:      { incidentType: 'FLOOD' },
      });

      expect(auditRepo.save).toHaveBeenCalledTimes(1);
      const saved = auditRepo.create.mock.calls[0][0] as Partial<AuditEvent>;
      expect(saved.actorId).toBe('user-1');
      expect(saved.eventType).toBe('incidents:create');
      expect(saved.resourceType).toBe('incident');
      expect(saved.resourceId).toBe('inc-1');
      expect(saved.success).toBe(true);
    });

    it('sets integrityHash before save (non-null, hex string)', async () => {
      await service.emit({ eventType: 'iam:login', actorId: 'user-1' });

      const saved = auditRepo.save.mock.calls[0][0] as Partial<AuditEvent>;
      expect(saved.integrityHash).toMatch(/^[0-9a-f]{64}$/);
    });

    it('defaults severity to INFO when not provided', async () => {
      await service.emit({ eventType: 'task:complete' });

      const saved = auditRepo.create.mock.calls[0][0] as Partial<AuditEvent>;
      expect(saved.severity).toBe(AuditSeverity.INFO);
    });

    it('defaults success to true when not provided', async () => {
      await service.emit({ eventType: 'search:query' });

      const saved = auditRepo.create.mock.calls[0][0] as Partial<AuditEvent>;
      expect(saved.success).toBe(true);
    });

    it('stores failure information when success=false', async () => {
      await service.emit({
        eventType:     'iam:login',
        success:       false,
        failureReason: 'Invalid password',
      });

      const saved = auditRepo.create.mock.calls[0][0] as Partial<AuditEvent>;
      expect(saved.success).toBe(false);
      expect(saved.failureReason).toBe('Invalid password');
    });

    it('handles system events with no actor (null actorId)', async () => {
      await service.emit({ eventType: 'system:startup' });

      const saved = auditRepo.create.mock.calls[0][0] as Partial<AuditEvent>;
      expect(saved.actorId).toBeNull();
      expect(saved.actorUsername).toBeNull();
    });

    it('never throws even when the DB call fails (resilience guarantee)', async () => {
      auditRepo.save.mockRejectedValue(new Error('DB connection lost'));

      // Must not throw — audit failures cannot break the primary operation
      await expect(service.emit({ eventType: 'task:update' })).resolves.not.toThrow();
    });

    it('generates distinct integrity hashes for each call (nonce-based)', async () => {
      await service.emit({ eventType: 'ev-1', actorId: 'u1' });
      await service.emit({ eventType: 'ev-2', actorId: 'u1' });

      const [call1, call2] = auditRepo.save.mock.calls;
      const hash1 = (call1[0] as Partial<AuditEvent>).integrityHash;
      const hash2 = (call2[0] as Partial<AuditEvent>).integrityHash;
      expect(hash1).not.toBe(hash2);
    });
  });

  // ── queryEvents ───────────────────────────────────────────────────────────

  describe('queryEvents', () => {
    it('returns empty list when no events match', async () => {
      const [events, total] = await service.queryEvents({});

      expect(events).toEqual([]);
      expect(total).toBe(0);
    });

    it('applies actorId filter', async () => {
      const qb = (auditRepo as any)._qb;

      await service.queryEvents({ actorId: 'user-1' });

      expect(qb.andWhere).toHaveBeenCalledWith(
        'e.actor_id = :actorId',
        { actorId: 'user-1' },
      );
    });

    it('applies eventType filter', async () => {
      const qb = (auditRepo as any)._qb;

      await service.queryEvents({ eventType: 'iam:login' });

      expect(qb.andWhere).toHaveBeenCalledWith(
        'e.event_type = :eventType',
        { eventType: 'iam:login' },
      );
    });

    it('applies date range filters (from + to)', async () => {
      const qb = (auditRepo as any)._qb;
      const from = new Date('2026-01-01');
      const to   = new Date('2026-03-31');

      await service.queryEvents({ from, to });

      expect(qb.andWhere).toHaveBeenCalledWith('e.occurred_at >= :from', { from });
      expect(qb.andWhere).toHaveBeenCalledWith('e.occurred_at <= :to', { to });
    });

    it('applies resourceType + resourceId filters together', async () => {
      const qb = (auditRepo as any)._qb;

      await service.queryEvents({ resourceType: 'incident', resourceId: 'inc-99' });

      expect(qb.andWhere).toHaveBeenCalledWith(
        'e.resource_type = :resourceType',
        { resourceType: 'incident' },
      );
      expect(qb.andWhere).toHaveBeenCalledWith(
        'e.resource_id = :resourceId',
        { resourceId: 'inc-99' },
      );
    });

    it('uses default limit of 50 when not provided', async () => {
      const qb = (auditRepo as any)._qb;

      await service.queryEvents({});

      expect(qb.limit).toHaveBeenCalledWith(50);
    });

    it('uses default offset of 0 when not provided', async () => {
      const qb = (auditRepo as any)._qb;

      await service.queryEvents({});

      expect(qb.offset).toHaveBeenCalledWith(0);
    });

    it('accepts custom limit and offset', async () => {
      const qb = (auditRepo as any)._qb;

      await service.queryEvents({ limit: 10, offset: 20 });

      expect(qb.limit).toHaveBeenCalledWith(10);
      expect(qb.offset).toHaveBeenCalledWith(20);
    });
  });
});
