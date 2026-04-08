"use client";

import { useState } from "react";
import { usePortalRealtimeRoom } from "@/components/realtime/usePortalRealtimeRoom";
import type { PortalCallSession } from "@/lib/calls";

type CallSessionLiveViewProps = {
  session: PortalCallSession;
};

function formatDateTime(value: string | null) {
  if (!value) {
    return "n/a";
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString("en-GB");
}

function normalizeParticipant(payload: Record<string, unknown>) {
  return {
    id: String(payload.id),
    userId: String(payload.userId ?? ""),
    positionId: typeof payload.positionId === "string" ? payload.positionId : null,
    displayName:
      typeof payload.displayName === "string" && payload.displayName.trim()
        ? payload.displayName
        : String(payload.userId ?? "Unknown participant"),
    status: String(payload.status ?? "invited"),
    joinedAt: typeof payload.joinedAt === "string" ? payload.joinedAt : null,
    leftAt: typeof payload.leftAt === "string" ? payload.leftAt : null,
    audioMuted: Boolean(payload.audioMuted),
    videoMuted: Boolean(payload.videoMuted),
    isModerator: Boolean(payload.isModerator),
  };
}

function normalizeRecording(payload: Record<string, unknown>) {
  const sizeValue = payload.sizeBytes;
  const durationValue = payload.durationSeconds;

  return {
    id: String(payload.id),
    sessionId: String(payload.sessionId ?? ""),
    status: String(payload.status ?? "recording"),
    classification: Number(payload.classification ?? 0),
    startedAt: String(payload.startedAt ?? payload.createdAt ?? ""),
    stoppedAt: typeof payload.stoppedAt === "string" ? payload.stoppedAt : null,
    expiresAt: typeof payload.expiresAt === "string" ? payload.expiresAt : null,
    initiatedById: String(payload.initiatedById ?? ""),
    durationSeconds:
      typeof durationValue === "number"
        ? durationValue
        : typeof durationValue === "string" && durationValue.trim()
          ? Number(durationValue)
          : null,
    sizeBytes:
      typeof sizeValue === "number"
        ? sizeValue
        : typeof sizeValue === "string" && sizeValue.trim()
          ? Number(sizeValue)
          : null,
    storageKey: typeof payload.storageKey === "string" ? payload.storageKey : null,
  };
}

function normalizeSessionSnapshot(payload: Record<string, unknown>): PortalCallSession {
  return {
    id: String(payload.id),
    channelId: String(payload.channelId ?? ""),
    initiatedById: String(payload.initiatedById ?? ""),
    status: String(payload.status ?? "active"),
    classification: Number(payload.classification ?? 0),
    scheduledStart: typeof payload.scheduledStart === "string" ? payload.scheduledStart : null,
    actualStart: typeof payload.actualStart === "string" ? payload.actualStart : null,
    endedAt: typeof payload.endedAt === "string" ? payload.endedAt : null,
    title: typeof payload.title === "string" ? payload.title : null,
    maxParticipants: Number(payload.maxParticipants ?? 50),
    createdAt: String(payload.createdAt ?? ""),
    updatedAt: String(payload.updatedAt ?? payload.createdAt ?? ""),
    participants: Array.isArray(payload.participants)
      ? payload.participants.map((participant) =>
          normalizeParticipant(participant as Record<string, unknown>),
        )
      : [],
    recordings: Array.isArray(payload.recordings)
      ? payload.recordings.map((recording) =>
          normalizeRecording(recording as Record<string, unknown>),
        )
      : [],
  };
}

export function CallSessionLiveView({ session }: CallSessionLiveViewProps) {
  const [liveSession, setLiveSession] = useState(session);
  const { status, lastEventAt } = usePortalRealtimeRoom({
    roomId: `call.session.${session.id}`,
    onMessage(message) {
      const eventName =
        (typeof message.event === "string" ? message.event : undefined) ??
        (typeof message.type === "string" ? message.type : undefined);
      const payload =
        message.data && typeof message.data === "object"
          ? (message.data as Record<string, unknown>)
          : null;

      if (!payload || !eventName?.startsWith("call.")) {
        return;
      }

      setLiveSession(normalizeSessionSnapshot(payload));
    },
  });

  return (
    <div className="portal-stack">
      <section className="portal-panel">
        <div className="portal-section-head">
          <h2>Live session state</h2>
          <p className="portal-note">
            realtime {status}
            {lastEventAt ? ` | last event ${formatDateTime(lastEventAt)}` : ""}
          </p>
        </div>
        <p className="portal-note">
          status {liveSession.status} | participants {liveSession.participants.length}/{liveSession.maxParticipants}
        </p>
      </section>

      <section className="portal-columns admin-split">
        <article className="portal-panel">
          <div className="portal-section-head">
            <h2>Participants</h2>
          </div>
          <ul className="portal-list">
            {liveSession.participants.length === 0 ? (
              <li>No participants registered.</li>
            ) : (
              liveSession.participants.map((participant) => (
                <li key={participant.id}>
                  <strong>{participant.displayName}</strong>
                  <p className="portal-note">
                    {participant.status}
                    {participant.isModerator ? " | moderator" : ""}
                    {participant.positionId ? ` | position ${participant.positionId}` : ""}
                  </p>
                  <p className="portal-note">
                    joined {formatDateTime(participant.joinedAt)} | left {formatDateTime(participant.leftAt)}
                  </p>
                </li>
              ))
            )}
          </ul>
        </article>

        <article className="portal-panel">
          <div className="portal-section-head">
            <h2>Recordings</h2>
          </div>
          <ul className="portal-list">
            {liveSession.recordings.length === 0 ? (
              <li>No recordings for this session.</li>
            ) : (
              liveSession.recordings.map((recording) => (
                <li key={recording.id}>
                  <strong>{recording.status}</strong>
                  <p className="portal-note">
                    started {formatDateTime(recording.startedAt)} | stopped {formatDateTime(recording.stoppedAt)}
                  </p>
                  <p className="portal-note">
                    expires {formatDateTime(recording.expiresAt)} | duration {recording.durationSeconds ?? 0}s | size {recording.sizeBytes ?? 0} bytes
                  </p>
                  <p className="portal-note">
                    artifact {recording.storageKey ?? "not finalized yet"}
                  </p>
                </li>
              ))
            )}
          </ul>
        </article>
      </section>
    </div>
  );
}
