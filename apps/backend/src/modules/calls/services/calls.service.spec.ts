import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  ForbiddenException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';

import { CallsService } from './calls.service';
import { CallSession, CallStatus } from '../entities/call-session.entity';
import { CallParticipant, ParticipantStatus } from '../entities/call-participant.entity';
import { CallRecording, RecordingStatus } from '../entities/call-recording.entity';
import { CallSchedule } from '../entities/call-schedule.entity';
import { AuditService } from '../../audit/services/audit.service';
import { MinioService } from '../../files/services/minio.service';
import { GatewayEventsService } from '../../../infra/events/gateway-events.service';
import { MediaCommandsService } from '../../../infra/events/media-commands.service';
import { InitiateCallDto, ScheduleCallDto } from '../dto/initiate-call.dto';

// ─── Retention map mirrored from the SUT ────────────────────────────────────

const RETENTION_DAYS: Record<number, number> = { 0: 90, 1: 180, 2: 365, 3: 365 };

// ─── Factory helpers ─────────────────────────────────────────────────────────

function makeSession(overrides: Partial<CallSession> = {}): CallSession {
  return Object.assign(new CallSession(), {
    id: 'sess-1',
    channelId: 'ch-1',
    initiatedById: 'actor-1',
    status: CallStatus.ACTIVE,
    classification: 0,
    maxParticipants: 50,
    actualStart: new Date(),
    endedAt: null,
    title: null,
    scheduledStart: null,
    participants: [],
    recordings: [],
    ...overrides,
  });
}

function makeParticipant(overrides: Partial<CallParticipant> = {}): CallParticipant {
  return Object.assign(new CallParticipant(), {
    id: 'part-1',
    sessionId: 'sess-1',
    userId: 'actor-1',
    positionId: null,
    displayName: 'actor-1',
    status: ParticipantStatus.JOINED,
    joinedAt: new Date(),
    leftAt: null,
    isModerator: false,
    audioMuted: false,
    videoMuted: false,
    ...overrides,
  });
}

function makeRecording(overrides: Partial<CallRecording> = {}): CallRecording {
  return Object.assign(new CallRecording(), {
    id: 'rec-1',
    sessionId: 'sess-1',
    status: RecordingStatus.RECORDING,
    classification: 0,
    initiatedById: 'actor-1',
    startedAt: new Date(),
    stoppedAt: null,
    expiresAt: null,
    storageKey: null,
    sizeBytes: null,
    durationSeconds: null,
    ...overrides,
  });
}

function makeSchedule(overrides: Partial<CallSchedule> = {}): CallSchedule {
  return Object.assign(new CallSchedule(), {
    id: 'sched-1',
    title: 'Team Sync',
    description: null,
    organizerId: 'actor-1',
    channelId: null,
    scheduledStart: new Date('2030-01-01T10:00:00Z'),
    scheduledEnd: new Date('2030-01-01T11:00:00Z'),
    classification: 0,
    maxParticipants: 50,
    sessionId: null,
    cancelledAt: null,
    cancelledById: null,
    ...overrides,
  });
}

// ─── Mock query-builder used by endCall and listUpcoming ─────────────────────

function makeQb(result: any = { affected: 1 }) {
  const qb: any = {
    update: jest.fn().mockReturnThis(),
    set: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    execute: jest.fn().mockResolvedValue(result),
    andWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
    getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
  };
  return qb;
}

// ─── Suite ───────────────────────────────────────────────────────────────────

describe('CallsService', () => {
  let service: CallsService;

  const mockSessionsRepo = {
    create: jest.fn(),
    save: jest.fn(),
    findOne: jest.fn(),
    createQueryBuilder: jest.fn(),
  };

  const mockParticipantsRepo = {
    create: jest.fn(),
    save: jest.fn(),
    findOne: jest.fn(),
    count: jest.fn(),
  };

  const mockRecordingsRepo = {
    create: jest.fn(),
    save: jest.fn(),
    findOne: jest.fn(),
    find: jest.fn(),
    createQueryBuilder: jest.fn(),
  };

  const mockSchedulesRepo = {
    create: jest.fn(),
    save: jest.fn(),
    createQueryBuilder: jest.fn(),
  };

  const mockEmitter = { emit: jest.fn() };
  const mockAudit   = { emit: jest.fn().mockResolvedValue(undefined) };
  const mockGatewayEvents = { publishToRoom: jest.fn().mockResolvedValue(undefined) };
  const mockMinioService = { presignedGetUrl: jest.fn().mockResolvedValue('https://minio/recording') };
  const mockMediaCommands = {
    endCallSession: jest.fn().mockResolvedValue(undefined),
    kickParticipant: jest.fn().mockResolvedValue(undefined),
    setParticipantMute: jest.fn().mockResolvedValue(undefined),
    startRecording: jest.fn().mockResolvedValue(undefined),
    stopRecording: jest.fn().mockResolvedValue(undefined),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CallsService,
        { provide: getRepositoryToken(CallSession),     useValue: mockSessionsRepo     },
        { provide: getRepositoryToken(CallParticipant), useValue: mockParticipantsRepo },
        { provide: getRepositoryToken(CallRecording),   useValue: mockRecordingsRepo   },
        { provide: getRepositoryToken(CallSchedule),    useValue: mockSchedulesRepo    },
        { provide: EventEmitter2,                       useValue: mockEmitter          },
        { provide: AuditService,                        useValue: mockAudit            },
        { provide: MinioService,                        useValue: mockMinioService     },
        { provide: GatewayEventsService,                useValue: mockGatewayEvents    },
        { provide: MediaCommandsService,                useValue: mockMediaCommands    },
      ],
    }).compile();

    service = module.get<CallsService>(CallsService);
  });

  // ── initiateCall ─────────────────────────────────────────────────────────────

  describe('initiateCall', () => {
    const dto: InitiateCallDto = {
      channelId: 'ch-1',
      classification: 1,
    };

    it('throws ForbiddenException when actorClearance < classification', async () => {
      await expect(
        service.initiateCall(dto, 'actor-1', undefined, 0),
      ).rejects.toThrow(ForbiddenException);
    });

    it('creates and saves a CallSession with ACTIVE status', async () => {
      const session = makeSession({ classification: 1 });
      mockSessionsRepo.create.mockReturnValue(session);
      mockSessionsRepo.save.mockResolvedValue(session);
      const participant = makeParticipant({ isModerator: true });
      mockParticipantsRepo.create.mockReturnValue(participant);
      mockParticipantsRepo.save.mockResolvedValue(participant);

      const result = await service.initiateCall(dto, 'actor-1', 'pos-1', 1);

      expect(mockSessionsRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ status: CallStatus.ACTIVE }),
      );
      expect(result).toBe(session);
    });

    it('initiator auto-joins as moderator', async () => {
      const session = makeSession({ id: 'sess-1', classification: 1 });
      mockSessionsRepo.create.mockReturnValue(session);
      mockSessionsRepo.save.mockResolvedValue(session);
      const participant = makeParticipant({ isModerator: true });
      mockParticipantsRepo.create.mockReturnValue(participant);
      mockParticipantsRepo.save.mockResolvedValue(participant);

      await service.initiateCall(dto, 'actor-1', 'pos-1', 1);

      expect(mockParticipantsRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ isModerator: true, userId: 'actor-1' }),
      );
      expect(mockParticipantsRepo.save).toHaveBeenCalled();
    });

    it('emits call.session_started event', async () => {
      const session = makeSession({ classification: 0 });
      mockSessionsRepo.create.mockReturnValue(session);
      mockSessionsRepo.save.mockResolvedValue(session);
      mockParticipantsRepo.create.mockReturnValue(makeParticipant());
      mockParticipantsRepo.save.mockResolvedValue(makeParticipant());

      await service.initiateCall({ channelId: 'ch-1' }, 'actor-1', undefined, 0);

      expect(mockEmitter.emit).toHaveBeenCalledWith(
        'call.session_started',
        expect.objectContaining({ sessionId: session.id }),
      );
    });

    it('calls auditService after successful initiation', async () => {
      const session = makeSession({ classification: 0 });
      mockSessionsRepo.create.mockReturnValue(session);
      mockSessionsRepo.save.mockResolvedValue(session);
      mockParticipantsRepo.create.mockReturnValue(makeParticipant());
      mockParticipantsRepo.save.mockResolvedValue(makeParticipant());

      await service.initiateCall({ channelId: 'ch-1' }, 'actor-1', undefined, 0);

      expect(mockAudit.emit).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'call.initiate' }),
      );
    });
  });

  // ── joinCall ─────────────────────────────────────────────────────────────────

  describe('joinCall', () => {
    it('throws NotFoundException when session does not exist', async () => {
      mockSessionsRepo.findOne.mockResolvedValue(null);

      await expect(service.joinCall('sess-x', 'actor-1', undefined, 3)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws BadRequestException when session is not ACTIVE', async () => {
      mockSessionsRepo.findOne.mockResolvedValue(makeSession({ status: CallStatus.ENDED }));

      await expect(service.joinCall('sess-1', 'actor-1', undefined, 3)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('throws ForbiddenException when actorClearance < session.classification', async () => {
      mockSessionsRepo.findOne.mockResolvedValue(makeSession({ classification: 2 }));

      await expect(service.joinCall('sess-1', 'actor-1', undefined, 1)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('throws BadRequestException when call is full', async () => {
      mockSessionsRepo.findOne.mockResolvedValue(makeSession({ maxParticipants: 2 }));
      mockParticipantsRepo.count.mockResolvedValue(2);

      await expect(service.joinCall('sess-1', 'actor-1', undefined, 0)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('creates a new participant record when none exists', async () => {
      const session = makeSession();
      mockSessionsRepo.findOne.mockResolvedValue(session);
      mockParticipantsRepo.count.mockResolvedValue(0);
      mockParticipantsRepo.findOne.mockResolvedValue(null);
      const newPart = makeParticipant({ isModerator: false });
      mockParticipantsRepo.create.mockReturnValue(newPart);
      mockParticipantsRepo.save.mockResolvedValue(newPart);

      const result = await service.joinCall('sess-1', 'actor-1', 'pos-1', 0);

      expect(mockParticipantsRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ isModerator: false }),
      );
      expect(result.participant).toBe(newPart);
    });

    it('emits call.participant_joined', async () => {
      mockSessionsRepo.findOne.mockResolvedValue(makeSession());
      mockParticipantsRepo.count.mockResolvedValue(0);
      mockParticipantsRepo.findOne.mockResolvedValue(null);
      const part = makeParticipant();
      mockParticipantsRepo.create.mockReturnValue(part);
      mockParticipantsRepo.save.mockResolvedValue(part);

      await service.joinCall('sess-1', 'actor-1', undefined, 0);

      expect(mockEmitter.emit).toHaveBeenCalledWith(
        'call.participant_joined',
        expect.objectContaining({ sessionId: 'sess-1', userId: 'actor-1' }),
      );
    });
  });

  // ── leaveCall ─────────────────────────────────────────────────────────────

  describe('leaveCall', () => {
    it('throws NotFoundException when participant record does not exist', async () => {
      mockParticipantsRepo.findOne.mockResolvedValue(null);

      await expect(service.leaveCall('sess-1', 'actor-1')).rejects.toThrow(NotFoundException);
    });

    it('marks participant as LEFT and sets leftAt', async () => {
      const part = makeParticipant({ status: ParticipantStatus.JOINED });
      mockParticipantsRepo.findOne.mockResolvedValue(part);
      mockParticipantsRepo.save.mockResolvedValue(part);

      await service.leaveCall('sess-1', 'actor-1');

      expect(part.status).toBe(ParticipantStatus.LEFT);
      expect(part.leftAt).toBeInstanceOf(Date);
    });

    it('emits call.participant_left', async () => {
      const part = makeParticipant();
      mockParticipantsRepo.findOne.mockResolvedValue(part);
      mockParticipantsRepo.save.mockResolvedValue(part);

      await service.leaveCall('sess-1', 'actor-1');

      expect(mockEmitter.emit).toHaveBeenCalledWith('call.participant_left', {
        sessionId: 'sess-1',
        userId: 'actor-1',
      });
    });
  });

  // ── endCall ───────────────────────────────────────────────────────────────

  describe('endCall', () => {
    it('throws NotFoundException when session does not exist', async () => {
      mockParticipantsRepo.findOne.mockResolvedValue(makeParticipant({ isModerator: true }));
      mockSessionsRepo.findOne.mockResolvedValue(null);

      await expect(service.endCall('sess-x', 'actor-1')).rejects.toThrow(NotFoundException);
    });

    it('returns session unchanged when already ENDED', async () => {
      mockParticipantsRepo.findOne.mockResolvedValue(makeParticipant({ isModerator: true }));
      const session = makeSession({ status: CallStatus.ENDED });
      mockSessionsRepo.findOne.mockResolvedValue(session);

      const result = await service.endCall('sess-1', 'actor-1');

      expect(result.status).toBe(CallStatus.ENDED);
      expect(mockSessionsRepo.save).not.toHaveBeenCalled();
    });

    it('sets status to ENDED and sets endedAt', async () => {
      mockParticipantsRepo.findOne.mockResolvedValue(makeParticipant({ isModerator: true }));
      const session = makeSession({ status: CallStatus.ACTIVE });
      mockSessionsRepo.findOne.mockResolvedValue(session);
      mockSessionsRepo.save.mockResolvedValue(session);
      mockRecordingsRepo.find.mockResolvedValue([]);

      await service.endCall('sess-1', 'actor-1');

      expect(session.status).toBe(CallStatus.ENDED);
      expect(session.endedAt).toBeInstanceOf(Date);
    });

    it('emits call.session_ended', async () => {
      mockParticipantsRepo.findOne.mockResolvedValue(makeParticipant({ isModerator: true }));
      const session = makeSession();
      mockSessionsRepo.findOne.mockResolvedValue(session);
      mockSessionsRepo.save.mockResolvedValue(session);
      mockRecordingsRepo.find.mockResolvedValue([]);

      await service.endCall('sess-1', 'actor-1');

      expect(mockEmitter.emit).toHaveBeenCalledWith('call.session_ended', {
        sessionId: 'sess-1',
      });
    });
  });

  // ── startRecording ────────────────────────────────────────────────────────

  describe('startRecording', () => {
    it('throws NotFoundException when session is not found', async () => {
      mockParticipantsRepo.findOne.mockResolvedValue(makeParticipant({ isModerator: true }));
      mockSessionsRepo.findOne.mockResolvedValue(null);

      await expect(service.startRecording('sess-x', 'actor-1', 3)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws ForbiddenException when actorClearance < session.classification', async () => {
      mockParticipantsRepo.findOne.mockResolvedValue(makeParticipant({ isModerator: true }));
      mockSessionsRepo.findOne.mockResolvedValue(makeSession({ classification: 3 }));

      await expect(service.startRecording('sess-1', 'actor-1', 1)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('throws BadRequestException when session is not ACTIVE', async () => {
      mockParticipantsRepo.findOne.mockResolvedValue(makeParticipant({ isModerator: true }));
      mockSessionsRepo.findOne.mockResolvedValue(makeSession({ status: CallStatus.ENDED }));

      await expect(service.startRecording('sess-1', 'actor-1', 3)).rejects.toThrow(
        BadRequestException,
      );
    });

    it.each([
      [0, 90],
      [1, 180],
      [2, 365],
      [3, 365],
    ])(
      'sets expiresAt to RETENTION_DAYS[%i]=%i days from now for classification %i',
      async (classification, expectedDays) => {
        mockParticipantsRepo.findOne.mockResolvedValue(makeParticipant({ isModerator: true }));
        mockSessionsRepo.findOne.mockResolvedValue(makeSession({ classification }));
        mockRecordingsRepo.findOne.mockResolvedValue(null);
        const recording = makeRecording({ classification });
        mockRecordingsRepo.create.mockReturnValue(recording);
        mockRecordingsRepo.save.mockResolvedValue(recording);

        const before = Date.now();
        await service.startRecording('sess-1', 'actor-1', 3);

        const [createdArg] = mockRecordingsRepo.create.mock.calls[0];
        const expiresAt: Date = createdArg.expiresAt;

        const diffDays = Math.round(
          (expiresAt.getTime() - before) / (1000 * 60 * 60 * 24),
        );
        expect(diffDays).toBe(expectedDays);
      },
    );

    it('creates recording with RECORDING status', async () => {
      mockParticipantsRepo.findOne.mockResolvedValue(makeParticipant({ isModerator: true }));
      mockSessionsRepo.findOne.mockResolvedValue(makeSession());
      mockRecordingsRepo.findOne.mockResolvedValue(null);
      const recording = makeRecording();
      mockRecordingsRepo.create.mockReturnValue(recording);
      mockRecordingsRepo.save.mockResolvedValue(recording);

      await service.startRecording('sess-1', 'actor-1', 0);

      expect(mockRecordingsRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ status: RecordingStatus.RECORDING }),
      );
    });

    it('emits call.recording_started', async () => {
      mockParticipantsRepo.findOne.mockResolvedValue(makeParticipant({ isModerator: true }));
      mockSessionsRepo.findOne.mockResolvedValue(makeSession());
      mockRecordingsRepo.findOne.mockResolvedValue(null);
      const recording = makeRecording();
      mockRecordingsRepo.create.mockReturnValue(recording);
      mockRecordingsRepo.save.mockResolvedValue(recording);

      await service.startRecording('sess-1', 'actor-1', 0);

      expect(mockEmitter.emit).toHaveBeenCalledWith(
        'call.recording_started',
        expect.objectContaining({ sessionId: 'sess-1' }),
      );
    });
  });

  // ── stopRecording ─────────────────────────────────────────────────────────

  describe('stopRecording', () => {
    it('throws NotFoundException when recording is not found', async () => {
      mockRecordingsRepo.findOne.mockResolvedValue(null);

      await expect(service.stopRecording('rec-x', 'actor-1')).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequestException when recording is not RECORDING', async () => {
      mockRecordingsRepo.findOne.mockResolvedValue(
        makeRecording({ status: RecordingStatus.STOPPED }),
      );

      await expect(service.stopRecording('rec-1', 'actor-1')).rejects.toThrow(BadRequestException);
    });

    it('transitions recording status to PROCESSING and sets stoppedAt', async () => {
      const recording = makeRecording({ status: RecordingStatus.RECORDING });
      mockRecordingsRepo.findOne.mockResolvedValue(recording);
      mockParticipantsRepo.findOne.mockResolvedValue(makeParticipant({ isModerator: true }));
      mockRecordingsRepo.save.mockResolvedValue(recording);

      await service.stopRecording('rec-1', 'actor-1');

      expect(recording.status).toBe(RecordingStatus.PROCESSING);
      expect(recording.stoppedAt).toBeInstanceOf(Date);
    });

    it('emits call.recording_stopped with correct ids', async () => {
      const recording = makeRecording({ id: 'rec-1', sessionId: 'sess-1' });
      mockRecordingsRepo.findOne.mockResolvedValue(recording);
      mockParticipantsRepo.findOne.mockResolvedValue(makeParticipant({ isModerator: true }));
      mockRecordingsRepo.save.mockResolvedValue(recording);

      await service.stopRecording('rec-1', 'actor-1');

      expect(mockEmitter.emit).toHaveBeenCalledWith('call.recording_stopped', {
        sessionId: 'sess-1',
        recordingId: 'rec-1',
      });
    });
  });

  // ── scheduleMeeting ───────────────────────────────────────────────────────

  describe('scheduleMeeting', () => {
    const dto: ScheduleCallDto = {
      title: 'Emergency Briefing',
      scheduledStart: '2030-06-01T09:00:00Z',
      scheduledEnd: '2030-06-01T10:00:00Z',
      classification: 2,
    };

    it('throws ForbiddenException when actorClearance < classification', async () => {
      await expect(service.scheduleMeeting(dto, 'actor-1', 1)).rejects.toThrow(ForbiddenException);
    });

    it('creates and saves a schedule with correct fields', async () => {
      const schedule = makeSchedule({ title: dto.title, classification: 2 });
      mockSchedulesRepo.create.mockReturnValue(schedule);
      mockSchedulesRepo.save.mockResolvedValue(schedule);

      const result = await service.scheduleMeeting(dto, 'actor-1', 2);

      expect(mockSchedulesRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          title: dto.title,
          classification: 2,
          organizerId: 'actor-1',
        }),
      );
      expect(result).toBe(schedule);
    });

    it('calls auditService with call.schedule action', async () => {
      const schedule = makeSchedule();
      mockSchedulesRepo.create.mockReturnValue(schedule);
      mockSchedulesRepo.save.mockResolvedValue(schedule);

      await service.scheduleMeeting(dto, 'actor-1', 3);

      expect(mockAudit.emit).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'call.schedule' }),
      );
    });
  });

  // ── listUpcoming ──────────────────────────────────────────────────────────

  describe('listUpcoming', () => {
    it('queries schedules filtered by actorClearance and returns paginated result', async () => {
      const items = [makeSchedule()];
      const qb = makeQb();
      qb.getManyAndCount.mockResolvedValue([items, 1]);
      mockSchedulesRepo.createQueryBuilder.mockReturnValue(qb);

      const result = await service.listUpcoming(2, 10, 0);

      expect(result.items).toBe(items);
      expect(result.total).toBe(1);
      expect(qb.where).toHaveBeenCalledWith('s.classification <= :clearance', { clearance: 2 });
    });

    it('returns empty items and zero total when no upcoming schedules', async () => {
      const qb = makeQb();
      qb.getManyAndCount.mockResolvedValue([[], 0]);
      mockSchedulesRepo.createQueryBuilder.mockReturnValue(qb);

      const result = await service.listUpcoming(0);

      expect(result.items).toHaveLength(0);
      expect(result.total).toBe(0);
    });
  });

  // ── getSession ────────────────────────────────────────────────────────────

  describe('getSession', () => {
    it('throws NotFoundException when session does not exist', async () => {
      mockSessionsRepo.findOne.mockResolvedValue(null);

      await expect(service.getSession('sess-x', 3)).rejects.toThrow(NotFoundException);
    });

    it('throws ForbiddenException when actorClearance < session.classification', async () => {
      mockSessionsRepo.findOne.mockResolvedValue(makeSession({ classification: 3 }));

      await expect(service.getSession('sess-1', 2)).rejects.toThrow(ForbiddenException);
    });

    it('returns session with relations when clearance is sufficient', async () => {
      const session = makeSession({ classification: 1 });
      mockSessionsRepo.findOne.mockResolvedValue(session);

      const result = await service.getSession('sess-1', 2);

      expect(result).toBe(session);
      expect(mockSessionsRepo.findOne).toHaveBeenCalledWith(
        expect.objectContaining({
          relations: expect.arrayContaining(['participants', 'recordings']),
        }),
      );
    });
  });

  describe('getRecordingDownloadUrl', () => {
    it('throws BadRequestException when recording artifact is not ready', async () => {
      mockRecordingsRepo.findOne.mockResolvedValue(
        makeRecording({ status: RecordingStatus.PROCESSING, storageKey: null }),
      );

      await expect(
        service.getRecordingDownloadUrl('rec-1', 'actor-1', 2),
      ).rejects.toThrow(BadRequestException);
    });

    it('returns presigned URL for a participant with sufficient clearance', async () => {
      const recording = makeRecording({
        status: RecordingStatus.READY,
        storageKey: 'recordings/cls1/rec-1/rec-1.tar',
        session: makeSession({ id: 'sess-1', classification: 1 }),
      } as Partial<CallRecording> & { session: CallSession });
      mockRecordingsRepo.findOne.mockResolvedValue(recording);
      mockParticipantsRepo.findOne.mockResolvedValue(makeParticipant({ sessionId: 'sess-1', userId: 'actor-2' }));

      const result = await service.getRecordingDownloadUrl('rec-1', 'actor-2', 2);

      expect(result.url).toBe('https://minio/recording');
      expect(mockMinioService.presignedGetUrl).toHaveBeenCalledWith(
        'recordings/cls1/rec-1/rec-1.tar',
        3600,
      );
    });
  });
});
