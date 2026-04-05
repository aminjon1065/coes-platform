import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';

import { CallSession, CallStatus } from '../entities/call-session.entity';
import { CallParticipant, ParticipantStatus } from '../entities/call-participant.entity';
import { CallRecording, RecordingStatus } from '../entities/call-recording.entity';
import { CallSchedule } from '../entities/call-schedule.entity';
import { AuditService } from '../../audit/services/audit.service';
import { InitiateCallDto, ScheduleCallDto } from '../dto/initiate-call.dto';

// Default recording retention: 90 days for unclassified, 365 for classified
const RETENTION_DAYS: Record<number, number> = { 0: 90, 1: 180, 2: 365, 3: 365 };

@Injectable()
export class CallsService {
  constructor(
    @InjectRepository(CallSession)
    private readonly sessionsRepo: Repository<CallSession>,

    @InjectRepository(CallParticipant)
    private readonly participantsRepo: Repository<CallParticipant>,

    @InjectRepository(CallRecording)
    private readonly recordingsRepo: Repository<CallRecording>,

    @InjectRepository(CallSchedule)
    private readonly schedulesRepo: Repository<CallSchedule>,

    private readonly eventEmitter: EventEmitter2,
    private readonly auditService: AuditService,
  ) {}

  // ── Initiate a call ────────────────────────────────────────────────────────

  async initiateCall(
    dto: InitiateCallDto,
    actorId: string,
    actorPositionId: string | undefined,
    actorClearance: number,
  ): Promise<CallSession> {
    const classification = dto.classification ?? 0;
    if (actorClearance < classification) {
      throw new ForbiddenException('Insufficient clearance to initiate this call');
    }

    const session = this.sessionsRepo.create({
      channelId: dto.channelId,
      initiatedById: actorId,
      classification,
      title: dto.title ?? null,
      maxParticipants: dto.maxParticipants ?? 50,
      status: CallStatus.ACTIVE,
      actualStart: new Date(),
    });
    await this.sessionsRepo.save(session);

    // Initiator joins immediately as moderator
    const participant = this.participantsRepo.create({
      sessionId: session.id,
      userId: actorId,
      positionId: actorPositionId ?? null,
      displayName: actorId,   // resolved by frontend via user profile
      status: ParticipantStatus.JOINED,
      joinedAt: new Date(),
      isModerator: true,
    });
    await this.participantsRepo.save(participant);

    this.eventEmitter.emit('call.session_started', {
      sessionId: session.id,
      channelId: session.channelId,
      initiatedById: actorId,
    });

    await this.auditService.emit({
      action: 'call.initiate',
      actorId,
      resourceType: 'call_session',
      resourceId: session.id,
      meta: { classification, channelId: dto.channelId },
    });

    return session;
  }

  // ── Join an active call ────────────────────────────────────────────────────

  async joinCall(
    sessionId: string,
    actorId: string,
    positionId: string | undefined,
    actorClearance: number,
  ): Promise<{ session: CallSession; participant: CallParticipant }> {
    const session = await this.sessionsRepo.findOne({ where: { id: sessionId } });
    if (!session) throw new NotFoundException('Call session not found');
    if (session.status !== CallStatus.ACTIVE) {
      throw new BadRequestException('Call is not active');
    }
    if (actorClearance < session.classification) {
      throw new ForbiddenException('Insufficient clearance to join this call');
    }

    // Check current participant count
    const count = await this.participantsRepo.count({
      where: { sessionId, status: ParticipantStatus.JOINED },
    });
    if (count >= session.maxParticipants) {
      throw new BadRequestException('Call is full');
    }

    // Upsert participant record
    let participant = await this.participantsRepo.findOne({
      where: { sessionId, userId: actorId },
    });

    if (participant) {
      participant.status = ParticipantStatus.JOINED;
      participant.joinedAt = new Date();
      participant.leftAt = null;
    } else {
      participant = this.participantsRepo.create({
        sessionId,
        userId: actorId,
        positionId: positionId ?? null,
        displayName: actorId,
        status: ParticipantStatus.JOINED,
        joinedAt: new Date(),
        isModerator: false,
      });
    }
    await this.participantsRepo.save(participant);

    this.eventEmitter.emit('call.participant_joined', {
      sessionId,
      userId: actorId,
      positionId,
    });

    return { session, participant };
  }

  // ── Leave a call ───────────────────────────────────────────────────────────

  async leaveCall(sessionId: string, actorId: string): Promise<void> {
    const participant = await this.participantsRepo.findOne({
      where: { sessionId, userId: actorId },
    });
    if (!participant) throw new NotFoundException('Participant record not found');

    participant.status = ParticipantStatus.LEFT;
    participant.leftAt = new Date();
    await this.participantsRepo.save(participant);

    this.eventEmitter.emit('call.participant_left', { sessionId, userId: actorId });
  }

  // ── End a call (moderator or backend job) ─────────────────────────────────

  async endCall(sessionId: string, actorId: string): Promise<CallSession> {
    const session = await this.sessionsRepo.findOne({ where: { id: sessionId } });
    if (!session) throw new NotFoundException('Call session not found');
    if (session.status === CallStatus.ENDED) return session;

    session.status = CallStatus.ENDED;
    session.endedAt = new Date();
    await this.sessionsRepo.save(session);

    // Stop any active recordings
    await this.recordingsRepo
      .createQueryBuilder()
      .update()
      .set({ status: RecordingStatus.STOPPED, stoppedAt: new Date() })
      .where('sessionId = :sessionId AND status = :status', {
        sessionId,
        status: RecordingStatus.RECORDING,
      })
      .execute();

    // Signal media service to tear down the SFU session
    this.eventEmitter.emit('call.session_ended', { sessionId });

    await this.auditService.emit({
      action: 'call.end',
      actorId,
      resourceType: 'call_session',
      resourceId: session.id,
      meta: {},
    });

    return session;
  }

  // ── Start recording ────────────────────────────────────────────────────────

  async startRecording(
    sessionId: string,
    actorId: string,
    actorClearance: number,
  ): Promise<CallRecording> {
    const session = await this.sessionsRepo.findOne({ where: { id: sessionId } });
    if (!session) throw new NotFoundException('Call session not found');
    if (session.status !== CallStatus.ACTIVE) {
      throw new BadRequestException('Cannot record an inactive call');
    }
    if (actorClearance < session.classification) {
      throw new ForbiddenException('Insufficient clearance to record this call');
    }

    const retentionDays = RETENTION_DAYS[session.classification] ?? 90;
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + retentionDays);

    const recording = this.recordingsRepo.create({
      sessionId,
      status: RecordingStatus.RECORDING,
      classification: session.classification,
      initiatedById: actorId,
      expiresAt,
    });
    await this.recordingsRepo.save(recording);

    this.eventEmitter.emit('call.recording_started', { sessionId, recordingId: recording.id });

    await this.auditService.emit({
      action: 'call.recording_start',
      actorId,
      resourceType: 'call_recording',
      resourceId: recording.id,
      meta: { sessionId },
    });

    return recording;
  }

  // ── Stop recording ─────────────────────────────────────────────────────────

  async stopRecording(recordingId: string, actorId: string): Promise<CallRecording> {
    const recording = await this.recordingsRepo.findOne({ where: { id: recordingId } });
    if (!recording) throw new NotFoundException('Recording not found');
    if (recording.status !== RecordingStatus.RECORDING) {
      throw new BadRequestException('Recording is not active');
    }

    recording.status = RecordingStatus.STOPPED;
    recording.stoppedAt = new Date();
    await this.recordingsRepo.save(recording);

    this.eventEmitter.emit('call.recording_stopped', {
      sessionId: recording.sessionId,
      recordingId,
    });

    await this.auditService.emit({
      action: 'call.recording_stop',
      actorId,
      resourceType: 'call_recording',
      resourceId: recordingId,
      meta: {},
    });

    return recording;
  }

  // ── Schedule a meeting ─────────────────────────────────────────────────────

  async scheduleMeeting(
    dto: ScheduleCallDto,
    organizerId: string,
    actorClearance: number,
  ): Promise<CallSchedule> {
    const classification = dto.classification ?? 0;
    if (actorClearance < classification) {
      throw new ForbiddenException('Insufficient clearance to schedule this meeting');
    }

    const schedule = this.schedulesRepo.create({
      title: dto.title,
      description: dto.description ?? null,
      organizerId,
      channelId: dto.channelId ?? null,
      scheduledStart: new Date(dto.scheduledStart),
      scheduledEnd: new Date(dto.scheduledEnd),
      classification,
      maxParticipants: dto.maxParticipants ?? 50,
    });
    await this.schedulesRepo.save(schedule);

    await this.auditService.emit({
      action: 'call.schedule',
      actorId: organizerId,
      resourceType: 'call_schedule',
      resourceId: schedule.id,
      meta: { scheduledStart: dto.scheduledStart },
    });

    return schedule;
  }

  // ── List upcoming meetings ─────────────────────────────────────────────────

  async listUpcoming(
    actorClearance: number,
    limit = 20,
    offset = 0,
  ): Promise<{ items: CallSchedule[]; total: number }> {
    const [items, total] = await this.schedulesRepo
      .createQueryBuilder('s')
      .where('s.classification <= :clearance', { clearance: actorClearance })
      .andWhere('s.scheduledStart > now()')
      .andWhere('s.cancelledAt IS NULL')
      .orderBy('s.scheduledStart', 'ASC')
      .skip(offset)
      .take(limit)
      .getManyAndCount();

    return { items, total };
  }

  // ── Get session details ────────────────────────────────────────────────────

  async getSession(sessionId: string, actorClearance: number): Promise<CallSession> {
    const session = await this.sessionsRepo.findOne({
      where: { id: sessionId },
      relations: ['participants', 'recordings'],
    });
    if (!session) throw new NotFoundException('Call session not found');
    if (actorClearance < session.classification) {
      throw new ForbiddenException('Insufficient clearance');
    }
    return session;
  }
}
