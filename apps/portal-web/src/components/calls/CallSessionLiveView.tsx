"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
    <div className="space-y-6">
      <Card className="border-border/60 bg-white/90 shadow-sm">
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <CardTitle className="font-heading text-2xl">Live session state</CardTitle>
            <CardDescription>
              realtime {status}
              {lastEventAt ? ` | last event ${formatDateTime(lastEventAt)}` : ""}
            </CardDescription>
          </div>
          <Badge variant="secondary">
            {liveSession.participants.length}/{liveSession.maxParticipants} participants
          </Badge>
        </CardHeader>
        <CardContent>
          <div className="rounded-2xl border border-border/70 bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
            status {liveSession.status}
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card className="border-border/60 bg-white/90 shadow-sm">
          <CardHeader>
            <CardTitle className="font-heading text-xl">Participants</CardTitle>
          </CardHeader>
          <CardContent>
            {liveSession.participants.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border/70 bg-muted/30 px-4 py-8 text-sm text-muted-foreground">
                No participants registered.
              </div>
            ) : (
              <div className="space-y-3">
                {liveSession.participants.map((participant) => (
                  <div key={participant.id} className="rounded-2xl border border-border/70 bg-background/80 p-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-base font-semibold text-foreground">{participant.displayName}</p>
                      <Badge variant="outline">{participant.status}</Badge>
                      {participant.isModerator ? <Badge variant="secondary">moderator</Badge> : null}
                    </div>
                    <p className="mt-2 text-sm text-muted-foreground">
                      {participant.positionId ? `position ${participant.positionId} | ` : ""}
                      joined {formatDateTime(participant.joinedAt)} | left {formatDateTime(participant.leftAt)}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-border/60 bg-white/90 shadow-sm">
          <CardHeader>
            <CardTitle className="font-heading text-xl">Recordings</CardTitle>
          </CardHeader>
          <CardContent>
            {liveSession.recordings.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border/70 bg-muted/30 px-4 py-8 text-sm text-muted-foreground">
                No recordings for this session.
              </div>
            ) : (
              <div className="space-y-3">
                {liveSession.recordings.map((recording) => (
                  <div key={recording.id} className="rounded-2xl border border-border/70 bg-background/80 p-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-base font-semibold text-foreground">{recording.status}</p>
                      <Badge variant="outline">class {recording.classification}</Badge>
                    </div>
                    <p className="mt-2 text-sm text-muted-foreground">
                      started {formatDateTime(recording.startedAt)} | stopped {formatDateTime(recording.stoppedAt)}
                    </p>
                    <p className="mt-2 text-sm text-muted-foreground">
                      expires {formatDateTime(recording.expiresAt)} | duration {recording.durationSeconds ?? 0}s | size {recording.sizeBytes ?? 0} bytes
                    </p>
                    <p className="mt-2 text-sm text-muted-foreground">
                      artifact {recording.storageKey ?? "not finalized yet"}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
