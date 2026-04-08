import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';

import { CallSession, CallStatus } from '../entities/call-session.entity';
import { CallParticipant, ParticipantStatus } from '../entities/call-participant.entity';
import { CallRecording, RecordingStatus } from '../entities/call-recording.entity';
import { CallSchedule } from '../entities/call-schedule.entity';
import { AuditService } from '../../audit/services/audit.service';
import { MinioService } from '../../files/services/minio.service';
import { GatewayEventsService } from '../../../infra/events/gateway-events.service';
import { MediaCommandsService } from '../../../infra/events/media-commands.service';
import { InitiateCallDto, ScheduleCallDto } from '../dto/initiate-call.dto';
import { ModerateParticipantDto } from '../dto/moderate-participant.dto';

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
    private readonly minioService: MinioService,
    private readonly gatewayEvents: GatewayEventsService,
    private readonly mediaCommands: MediaCommandsService,
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

    await this.publishSessionUpdate(session.id, 'call.session.started');

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

    await this.publishSessionUpdate(sessionId, 'call.participant.joined');

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
    await this.publishSessionUpdate(sessionId, 'call.participant.left');
  }

  // ── End a call (moderator or backend job) ─────────────────────────────────

  async endCall(sessionId: string, actorId: string): Promise<CallSession> {
    await this.assertModerator(sessionId, actorId);

    const session = await this.sessionsRepo.findOne({ where: { id: sessionId } });
    if (!session) throw new NotFoundException('Call session not found');
    if (session.status === CallStatus.ENDED) return session;

    session.status = CallStatus.ENDED;
    session.endedAt = new Date();
    await this.sessionsRepo.save(session);

    const activeRecordings = await this.recordingsRepo.find({
      where: { sessionId, status: RecordingStatus.RECORDING },
    });
    if (activeRecordings.length > 0) {
      const stoppedAt = new Date();
      await this.recordingsRepo
        .createQueryBuilder()
        .update()
        .set({ status: RecordingStatus.PROCESSING, stoppedAt })
        .where('sessionId = :sessionId AND status = :status', {
          sessionId,
          status: RecordingStatus.RECORDING,
        })
        .execute();

      await Promise.all(
        activeRecordings.map((recording) =>
          this.mediaCommands.stopRecording(sessionId, recording.id),
        ),
      );
    }

    // Signal media service to tear down the SFU session
    this.eventEmitter.emit('call.session_ended', { sessionId });
    await this.mediaCommands.endCallSession(sessionId);

    await this.auditService.emit({
      action: 'call.end',
      actorId,
      resourceType: 'call_session',
      resourceId: session.id,
      meta: {},
    });

    await this.publishSessionUpdate(sessionId, 'call.session.ended');

    return session;
  }

  async moderateParticipant(
    sessionId: string,
    participantId: string,
    actorId: string,
    dto: ModerateParticipantDto,
  ): Promise<CallParticipant> {
    await this.assertModerator(sessionId, actorId);

    const participant = await this.participantsRepo.findOne({
      where: { id: participantId, sessionId },
    });
    if (!participant) {
      throw new NotFoundException('Participant record not found');
    }

    if (dto.audioMuted !== undefined) {
      participant.audioMuted = dto.audioMuted;
    }
    if (dto.videoMuted !== undefined) {
      participant.videoMuted = dto.videoMuted;
    }

    const saved = await this.participantsRepo.save(participant);
    await this.mediaCommands.setParticipantMute(
      sessionId,
      participant.positionId ?? participant.userId,
      dto.audioMuted,
      dto.videoMuted,
    );

    await this.auditService.emit({
      action: 'call.participant_moderated',
      actorId,
      resourceType: 'call_participant',
      resourceId: participant.id,
      meta: {
        sessionId,
        audioMuted: participant.audioMuted,
        videoMuted: participant.videoMuted,
      },
    });

    await this.publishSessionUpdate(sessionId, 'call.participant.moderated');
    return saved;
  }

  async removeParticipant(
    sessionId: string,
    participantId: string,
    actorId: string,
  ): Promise<void> {
    await this.assertModerator(sessionId, actorId);

    const participant = await this.participantsRepo.findOne({
      where: { id: participantId, sessionId },
    });
    if (!participant) {
      throw new NotFoundException('Participant record not found');
    }

    participant.status = ParticipantStatus.LEFT;
    participant.leftAt = new Date();
    await this.participantsRepo.save(participant);
    await this.mediaCommands.kickParticipant(sessionId, participant.positionId ?? participant.userId);

    this.eventEmitter.emit('call.participant_removed', {
      sessionId,
      participantId,
      removedById: actorId,
    });

    await this.auditService.emit({
      action: 'call.participant_removed',
      actorId,
      resourceType: 'call_participant',
      resourceId: participant.id,
      meta: { sessionId },
    });

    await this.publishSessionUpdate(sessionId, 'call.participant.removed');
  }

  // ── Start recording ────────────────────────────────────────────────────────

  async startRecording(
    sessionId: string,
    actorId: string,
    actorClearance: number,
  ): Promise<CallRecording> {
    await this.assertModerator(sessionId, actorId);

    const session = await this.sessionsRepo.findOne({ where: { id: sessionId } });
    if (!session) throw new NotFoundException('Call session not found');
    if (session.status !== CallStatus.ACTIVE) {
      throw new BadRequestException('Cannot record an inactive call');
    }
    if (actorClearance < session.classification) {
      throw new ForbiddenException('Insufficient clearance to record this call');
    }

    const existingRecording = await this.recordingsRepo.findOne({
      where: { sessionId, status: RecordingStatus.RECORDING },
    });
    if (existingRecording) {
      throw new BadRequestException('Recording is already active for this session');
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

    await this.mediaCommands.startRecording(sessionId, recording.id);
    await this.publishSessionUpdate(sessionId, 'call.recording.started');

    return recording;
  }

  // ── Stop recording ─────────────────────────────────────────────────────────

  async stopRecording(recordingId: string, actorId: string): Promise<CallRecording> {
    const recording = await this.recordingsRepo.findOne({ where: { id: recordingId } });
    if (!recording) throw new NotFoundException('Recording not found');
    if (recording.status !== RecordingStatus.RECORDING) {
      throw new BadRequestException('Recording is not active');
    }

    await this.assertModerator(recording.sessionId, actorId);

    recording.status = RecordingStatus.PROCESSING;
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

    await this.mediaCommands.stopRecording(recording.sessionId, recordingId);
    await this.publishSessionUpdate(recording.sessionId, 'call.recording.stopped');

    return recording;
  }

  async markRecordingStarted(recordingId: string, sessionId: string): Promise<void> {
    const recording = await this.recordingsRepo.findOne({ where: { id: recordingId } });
    if (!recording) {
      return;
    }

    if (recording.status !== RecordingStatus.RECORDING) {
      recording.status = RecordingStatus.RECORDING;
      await this.recordingsRepo.save(recording);
    }

    await this.publishSessionUpdate(sessionId, 'call.recording.pipeline_started');
  }

  async markRecordingReady(
    recordingId: string,
    input: {
      sessionId: string;
      storageKey: string;
      sizeBytes: number;
      durationSeconds: number;
    },
  ): Promise<void> {
    const recording = await this.recordingsRepo.findOne({ where: { id: recordingId } });
    if (!recording) {
      return;
    }

    recording.status = RecordingStatus.READY;
    recording.storageKey = input.storageKey;
    recording.sizeBytes = String(input.sizeBytes);
    recording.durationSeconds = input.durationSeconds;
    recording.stoppedAt = recording.stoppedAt ?? new Date();
    await this.recordingsRepo.save(recording);

    await this.auditService.emit({
      action: 'call.recording_ready',
      actorId: recording.initiatedById,
      resourceType: 'call_recording',
      resourceId: recording.id,
      meta: {
        sessionId: input.sessionId,
        storageKey: input.storageKey,
        durationSeconds: input.durationSeconds,
      },
    });

    await this.publishSessionUpdate(input.sessionId, 'call.recording.ready');
  }

  async markRecordingFailed(
    recordingId: string,
    input: {
      sessionId: string;
      error: string;
    },
  ): Promise<void> {
    const recording = await this.recordingsRepo.findOne({ where: { id: recordingId } });
    if (!recording) {
      return;
    }

    recording.status = RecordingStatus.FAILED;
    recording.stoppedAt = recording.stoppedAt ?? new Date();
    await this.recordingsRepo.save(recording);

    await this.auditService.emit({
      action: 'call.recording_failed',
      actorId: recording.initiatedById,
      resourceType: 'call_recording',
      resourceId: recording.id,
      meta: {
        sessionId: input.sessionId,
        error: input.error,
      },
    });

    await this.publishSessionUpdate(input.sessionId, 'call.recording.failed');
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

  async getRecordingDownloadUrl(
    recordingId: string,
    actorId: string,
    actorClearance: number,
    expirySeconds = 3600,
  ): Promise<{ url: string; expiresInSeconds: number }> {
    const recording = await this.recordingsRepo.findOne({
      where: { id: recordingId },
      relations: ['session'],
    });
    if (!recording) {
      throw new NotFoundException('Recording not found');
    }

    if (recording.status !== RecordingStatus.READY || !recording.storageKey) {
      throw new BadRequestException('Recording artifact is not ready');
    }

    const session = recording.session;
    if (!session) {
      throw new NotFoundException('Call session not found for recording');
    }
    if (actorClearance < session.classification) {
      throw new ForbiddenException('Insufficient clearance');
    }

    const participant = await this.participantsRepo.findOne({
      where: { sessionId: session.id, userId: actorId },
    });
    if (!participant && session.initiatedById !== actorId) {
      throw new ForbiddenException('Recording access is limited to call participants');
    }

    const url = await this.minioService.presignedGetUrl(recording.storageKey, expirySeconds);

    await this.auditService.emit({
      action: 'call.recording_download_url_generated',
      actorId,
      resourceType: 'call_recording',
      resourceId: recording.id,
      meta: {
        sessionId: session.id,
        expiresInSeconds: expirySeconds,
      },
    });

    return {
      url,
      expiresInSeconds: expirySeconds,
    };
  }

  private async publishSessionUpdate(sessionId: string, event: string): Promise<void> {
    const session = await this.sessionsRepo.findOne({
      where: { id: sessionId },
      relations: ['participants', 'recordings'],
    });

    if (!session) {
      return;
    }

    await this.gatewayEvents.publishToRoom(`call.session.${sessionId}`, {
      event,
      data: session,
    });
  }

  private async assertModerator(sessionId: string, actorId: string): Promise<void> {
    const actorParticipant = await this.participantsRepo.findOne({
      where: {
        sessionId,
        userId: actorId,
        status: ParticipantStatus.JOINED,
        isModerator: true,
      },
    });

    if (!actorParticipant) {
      throw new ForbiddenException('Moderator privileges required');
    }
  }
}
