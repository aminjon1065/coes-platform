import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { SiemExportService } from './siem-export.service';
import { AuditEvent, AuditSeverity } from '../entities/audit-event.entity';
import { AuditArchive } from '../entities/audit-archive.entity';

// ── Helpers ──────────────────────────────────────────────────────────────────

const uid = () => require('crypto').randomUUID();

function makeEvent(overrides: Partial<AuditEvent> = {}): AuditEvent {
  return {
    id: uid(),
    actorId: 'user-1',
    actorUsername: 'john.doe',
    eventType: 'iam.user.login',
    resourceType: 'user_credential',
    resourceId: 'cred-1',
    ipAddress: '10.0.0.1',
    userAgent: 'Mozilla/5.0',
    success: true,
    failureReason: null,
    severity: AuditSeverity.INFO,
    metadata: null,
    integrityHash: 'abc123def456',
    occurredAt: new Date('2026-04-06T10:00:00Z'),
    ...overrides,
  } as AuditEvent;
}

function makeRepo<T>(extra: Partial<Record<string, jest.Mock>> = {}) {
  return {
    findOne: jest.fn(),
    find: jest.fn(),
    create: jest.fn((d: any) => ({ ...d })),
    save: jest.fn(async (d: any) => d),
    createQueryBuilder: jest.fn(),
    ...extra,
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('SiemExportService', () => {
  let service: SiemExportService;
  let auditRepo: ReturnType<typeof makeRepo>;
  let archiveRepo: ReturnType<typeof makeRepo>;

  const mockQb = {
    andWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    offset: jest.fn().mockReturnThis(),
    delete: jest.fn().mockReturnThis(),
    whereInIds: jest.fn().mockReturnThis(),
    execute: jest.fn().mockResolvedValue({ affected: 5 }),
    getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
  };

  beforeEach(async () => {
    auditRepo = makeRepo({ createQueryBuilder: jest.fn(() => mockQb) });
    archiveRepo = makeRepo({ createQueryBuilder: jest.fn(() => mockQb) });

    // Reset all mock call counts
    Object.values(mockQb).forEach((fn: any) => fn.mockClear?.());
    mockQb.andWhere.mockReturnThis();
    mockQb.orderBy.mockReturnThis();
    mockQb.limit.mockReturnThis();
    mockQb.offset.mockReturnThis();
    mockQb.delete.mockReturnThis();
    mockQb.whereInIds.mockReturnThis();
    mockQb.execute.mockResolvedValue({ affected: 5 });
    mockQb.getManyAndCount.mockResolvedValue([[], 0]);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SiemExportService,
        { provide: getRepositoryToken(AuditEvent), useValue: auditRepo },
        { provide: getRepositoryToken(AuditArchive), useValue: archiveRepo },
      ],
    }).compile();

    service = module.get(SiemExportService);
  });

  // ── CEF formatting ─────────────────────────────────────────────────────────

  describe('formatCef', () => {
    it('produces a valid CEF header line', () => {
      const event = makeEvent();
      const cef = service.formatCef(event);

      expect(cef).toMatch(/^CEF:0\|/);
      expect(cef).toContain('CoESCD');
      expect(cef).toContain('UnifiedPlatform');
      expect(cef).toContain('IAM_USER_LOGIN');
    });

    it('includes actor username in extension', () => {
      const event = makeEvent({ actorUsername: 'john.doe' });
      const cef = service.formatCef(event);
      expect(cef).toContain('suser=john.doe');
    });

    it('includes source IP in extension', () => {
      const event = makeEvent({ ipAddress: '192.168.1.50' });
      const cef = service.formatCef(event);
      expect(cef).toContain('src=192.168.1.50');
    });

    it('marks failure events with outcome=failure', () => {
      const event = makeEvent({ success: false, failureReason: 'Bad password' });
      const cef = service.formatCef(event);
      expect(cef).toContain('outcome=failure');
      expect(cef).toContain('msg=Bad password');
    });

    it('includes integrity hash', () => {
      const event = makeEvent({ integrityHash: 'deadbeef' });
      const cef = service.formatCef(event);
      expect(cef).toContain('cs3=deadbeef');
    });

    it('escapes pipe characters in event type', () => {
      const event = makeEvent({ eventType: 'type|with|pipes' });
      const cef = service.formatCef(event);
      // The header should not have unescaped pipes within field values
      const parts = cef.split('|');
      expect(parts.length).toBe(8); // 7 header separators + extension
    });

    it('maps CRITICAL severity to CEF severity 9', () => {
      const event = makeEvent({ severity: AuditSeverity.CRITICAL });
      const cef = service.formatCef(event);
      // CEF header format: ...SignatureId|Name|Severity|Extension
      const parts = cef.split('|');
      expect(parts[6]).toBe('9');
    });

    it('maps INFO severity to CEF severity 3', () => {
      const event = makeEvent({ severity: AuditSeverity.INFO });
      const parts = service.formatCef(event).split('|');
      expect(parts[6]).toBe('3');
    });
  });

  // ── Syslog formatting ──────────────────────────────────────────────────────

  describe('formatSyslog', () => {
    it('produces a valid RFC 5424 syslog line', () => {
      const event = makeEvent();
      const syslog = service.formatSyslog(event, 'test-host');

      // Should start with <PRI>1
      expect(syslog).toMatch(/^<\d+>1 /);
      expect(syslog).toContain('test-host');
      expect(syslog).toContain('coescd-backend');
      expect(syslog).toContain('IAM_USER_LOGIN');
    });

    it('sets correct priority for CRITICAL events (facility 13, severity 2)', () => {
      const event = makeEvent({ severity: AuditSeverity.CRITICAL });
      const syslog = service.formatSyslog(event);
      // pri = 13 * 8 + 2 = 106
      expect(syslog).toMatch(/^<106>/);
    });

    it('sets correct priority for INFO events (facility 13, severity 6)', () => {
      const event = makeEvent({ severity: AuditSeverity.INFO });
      const syslog = service.formatSyslog(event);
      // pri = 13 * 8 + 6 = 110
      expect(syslog).toMatch(/^<110>/);
    });
  });

  // ── exportCef ──────────────────────────────────────────────────────────────

  describe('exportCef', () => {
    it('returns CEF lines for matching events', async () => {
      const events = [makeEvent(), makeEvent({ eventType: 'tasks.task.created' })];
      mockQb.getManyAndCount.mockResolvedValue([events, 2]);

      const lines = await service.exportCef({});

      expect(lines).toHaveLength(2);
      expect(lines[0]).toMatch(/^CEF:0\|/);
      expect(lines[1]).toMatch(/^CEF:0\|/);
    });

    it('returns empty array when no events match', async () => {
      mockQb.getManyAndCount.mockResolvedValue([[], 0]);
      const lines = await service.exportCef({ actorId: 'nobody' });
      expect(lines).toEqual([]);
    });
  });

  // ── queryAuditTrail ────────────────────────────────────────────────────────

  describe('queryAuditTrail', () => {
    it('returns events and count', async () => {
      const events = [makeEvent()];
      mockQb.getManyAndCount.mockResolvedValue([events, 1]);

      const [result, count] = await service.queryAuditTrail({ actorId: 'user-1' });

      expect(result).toHaveLength(1);
      expect(count).toBe(1);
    });

    it('applies domain filter as LIKE prefix', async () => {
      mockQb.getManyAndCount.mockResolvedValue([[], 0]);

      await service.queryAuditTrail({ domains: ['iam', 'tasks'] });

      expect(mockQb.andWhere).toHaveBeenCalledWith(
        expect.stringContaining('event_type LIKE'),
        expect.objectContaining({ domain0: 'iam.%', domain1: 'tasks.%' }),
      );
    });

    it('caps limit at 1000', async () => {
      mockQb.getManyAndCount.mockResolvedValue([[], 0]);
      await service.queryAuditTrail({ limit: 9999 });
      expect(mockQb.limit).toHaveBeenCalledWith(1000);
    });
  });

  // ── archiveOldEvents ────────────────────────────────────────────────────────

  describe('archiveOldEvents', () => {
    it('moves old events to archive and deletes from hot table', async () => {
      const oldEvents = [makeEvent(), makeEvent()];
      auditRepo.find.mockResolvedValue(oldEvents);

      await service.archiveOldEvents();

      expect(archiveRepo.save).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ originalId: oldEvents[0].id }),
          expect.objectContaining({ originalId: oldEvents[1].id }),
        ]),
      );
      expect(mockQb.whereInIds).toHaveBeenCalledWith(oldEvents.map((e) => e.id));
      expect(mockQb.execute).toHaveBeenCalled();
    });

    it('skips archiving when no old events exist', async () => {
      auditRepo.find.mockResolvedValue([]);
      await service.archiveOldEvents();
      expect(archiveRepo.save).not.toHaveBeenCalled();
    });
  });

  // ── purgeExpiredArchives ───────────────────────────────────────────────────

  describe('purgeExpiredArchives', () => {
    it('purges archives older than 7 years', async () => {
      await service.purgeExpiredArchives();
      expect(mockQb.execute).toHaveBeenCalled();
    });

    it('logs the number of purged records', async () => {
      const logSpy = jest.spyOn(service['logger'], 'log').mockImplementation();
      mockQb.execute.mockResolvedValue({ affected: 42 });
      await service.purgeExpiredArchives();
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('42'));
    });
  });
});
