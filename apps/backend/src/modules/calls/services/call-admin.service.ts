import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CallSession, CallStatus } from '../entities/call-session.entity';
import { CallParticipant, ParticipantStatus } from '../entities/call-participant.entity';
import { CallRecording, RecordingStatus } from '../entities/call-recording.entity';
import { CallSchedule } from '../entities/call-schedule.entity';
import { CallRecordingRetentionService } from './call-recording-retention.service';

@Injectable()
export class CallAdminService {
  constructor(
    @InjectRepository(CallSession)
    private readonly sessionsRepo: Repository<CallSession>,
    @InjectRepository(CallParticipant)
    private readonly participantsRepo: Repository<CallParticipant>,
    @InjectRepository(CallRecording)
    private readonly recordingsRepo: Repository<CallRecording>,
    @InjectRepository(CallSchedule)
    private readonly schedulesRepo: Repository<CallSchedule>,
    private readonly retentionService: CallRecordingRetentionService,
  ) {}

  async getOperationsSummary() {
    const now = new Date();
    const [
      activeSessions,
      totalSessions,
      joinedParticipants,
      upcomingSchedules,
      recordings,
      media,
    ] = await Promise.all([
      this.sessionsRepo.count({ where: { status: CallStatus.ACTIVE } }),
      this.sessionsRepo.count(),
      this.participantsRepo.count({ where: { status: ParticipantStatus.JOINED } }),
      this.schedulesRepo
        .createQueryBuilder('schedule')
        .where('schedule.cancelledAt IS NULL')
        .andWhere('schedule.scheduledStart > :now', { now })
        .getCount(),
      this.recordingsRepo.find(),
      this.getMediaHealth(),
    ]);

    const countsByStatus = recordings.reduce<Record<string, number>>((acc, recording) => {
      acc[recording.status] = (acc[recording.status] ?? 0) + 1;
      return acc;
    }, {});

    const expiringSoon = recordings.filter(
      (recording) =>
        recording.status === RecordingStatus.READY &&
        recording.expiresAt &&
        recording.expiresAt.getTime() <= now.getTime() + 7 * 24 * 60 * 60 * 1000,
    ).length;

    return {
      kpis: {
        activeSessions,
        totalSessions,
        joinedParticipants,
        upcomingSchedules,
      },
      recordings: {
        recording: countsByStatus[RecordingStatus.RECORDING] ?? 0,
        processing: countsByStatus[RecordingStatus.PROCESSING] ?? 0,
        ready: countsByStatus[RecordingStatus.READY] ?? 0,
        failed: countsByStatus[RecordingStatus.FAILED] ?? 0,
        deleted: countsByStatus[RecordingStatus.DELETED] ?? 0,
        expiringSoon,
      },
      media,
      retention: this.retentionService.getLastRunSummary(),
    };
  }

  private async getMediaHealth() {
    const baseUrl = process.env.MEDIA_SERVICE_BASE_URL ?? 'http://localhost:4002';

    try {
      const [healthResponse, metricsResponse] = await Promise.all([
        fetch(`${baseUrl}/health`, { cache: 'no-store' }),
        fetch(`${baseUrl}/metrics`, { cache: 'no-store' }),
      ]);

      const healthPayload = healthResponse.ok
        ? ((await healthResponse.json()) as Record<string, unknown>)
        : null;
      const metricsText = metricsResponse.ok ? await metricsResponse.text() : '';
      const activeSessions = this.parseGauge(metricsText, 'media_active_sessions');

      return {
        reachable: healthResponse.ok,
        status: String(healthPayload?.status ?? (healthResponse.ok ? 'ok' : 'degraded')),
        service:
          typeof healthPayload?.service === 'string' ? String(healthPayload.service) : null,
        ts: typeof healthPayload?.ts === 'number' ? healthPayload.ts : null,
        activeSessions,
        raw: healthPayload ?? undefined,
      };
    } catch (error) {
      return {
        reachable: false,
        status: 'unreachable',
        service: null,
        ts: null,
        activeSessions: null,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  private parseGauge(metricsText: string, name: string): number | null {
    const line = metricsText
      .split(/\r?\n/)
      .find((entry) => entry.startsWith(`${name} `));
    if (!line) {
      return null;
    }

    const value = Number(line.split(/\s+/)[1]);
    return Number.isFinite(value) ? value : null;
  }
}
