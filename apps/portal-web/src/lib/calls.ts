import { authorizedBackendJson } from "@/lib/auth";

export type PortalCallParticipant = {
  id: string;
  userId: string;
  positionId: string | null;
  displayName: string;
  status: string;
  joinedAt: string | null;
  leftAt: string | null;
  audioMuted: boolean;
  videoMuted: boolean;
  isModerator: boolean;
};

export type PortalCallRecording = {
  id: string;
  sessionId: string;
  status: string;
  classification: number;
  startedAt: string;
  stoppedAt: string | null;
  expiresAt: string | null;
  initiatedById: string;
  durationSeconds: number | null;
  sizeBytes: number | null;
  storageKey: string | null;
};

export type PortalCallSession = {
  id: string;
  channelId: string;
  initiatedById: string;
  status: string;
  classification: number;
  scheduledStart: string | null;
  actualStart: string | null;
  endedAt: string | null;
  title: string | null;
  maxParticipants: number;
  createdAt: string;
  updatedAt: string;
  participants: PortalCallParticipant[];
  recordings: PortalCallRecording[];
};

export type PortalCallSchedule = {
  id: string;
  title: string;
  description: string | null;
  organizerId: string;
  channelId: string | null;
  scheduledStart: string;
  scheduledEnd: string;
  classification: number;
  maxParticipants: number;
  sessionId: string | null;
  cancelledAt: string | null;
  createdAt: string;
  updatedAt: string;
};

function numberOrNull(value: unknown) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function normalizeParticipant(item: Record<string, unknown>): PortalCallParticipant {
  return {
    id: String(item.id),
    userId: String(item.userId ?? ""),
    positionId: typeof item.positionId === "string" ? item.positionId : null,
    displayName:
      typeof item.displayName === "string" && item.displayName.trim()
        ? item.displayName
        : String(item.userId ?? "Unknown participant"),
    status: String(item.status ?? "invited"),
    joinedAt: typeof item.joinedAt === "string" ? item.joinedAt : null,
    leftAt: typeof item.leftAt === "string" ? item.leftAt : null,
    audioMuted: Boolean(item.audioMuted),
    videoMuted: Boolean(item.videoMuted),
    isModerator: Boolean(item.isModerator),
  };
}

function normalizeRecording(item: Record<string, unknown>): PortalCallRecording {
  return {
    id: String(item.id),
    sessionId: String(item.sessionId ?? ""),
    status: String(item.status ?? "recording"),
    classification: Number(item.classification ?? 0),
    startedAt: String(item.startedAt ?? item.createdAt ?? ""),
    stoppedAt: typeof item.stoppedAt === "string" ? item.stoppedAt : null,
    expiresAt: typeof item.expiresAt === "string" ? item.expiresAt : null,
    initiatedById: String(item.initiatedById ?? ""),
    durationSeconds: numberOrNull(item.durationSeconds),
    sizeBytes: numberOrNull(item.sizeBytes),
    storageKey: typeof item.storageKey === "string" ? item.storageKey : null,
  };
}

function normalizeSession(item: Record<string, unknown>): PortalCallSession {
  return {
    id: String(item.id),
    channelId: String(item.channelId ?? ""),
    initiatedById: String(item.initiatedById ?? ""),
    status: String(item.status ?? "active"),
    classification: Number(item.classification ?? 0),
    scheduledStart: typeof item.scheduledStart === "string" ? item.scheduledStart : null,
    actualStart: typeof item.actualStart === "string" ? item.actualStart : null,
    endedAt: typeof item.endedAt === "string" ? item.endedAt : null,
    title: typeof item.title === "string" ? item.title : null,
    maxParticipants: Number(item.maxParticipants ?? 50),
    createdAt: String(item.createdAt ?? ""),
    updatedAt: String(item.updatedAt ?? item.createdAt ?? ""),
    participants: Array.isArray(item.participants)
      ? item.participants.map((participant) =>
          normalizeParticipant(participant as Record<string, unknown>),
        )
      : [],
    recordings: Array.isArray(item.recordings)
      ? item.recordings.map((recording) =>
          normalizeRecording(recording as Record<string, unknown>),
        )
      : [],
  };
}

function normalizeSchedule(item: Record<string, unknown>): PortalCallSchedule {
  return {
    id: String(item.id),
    title: String(item.title ?? "Untitled call"),
    description: typeof item.description === "string" ? item.description : null,
    organizerId: String(item.organizerId ?? ""),
    channelId: typeof item.channelId === "string" ? item.channelId : null,
    scheduledStart: String(item.scheduledStart ?? ""),
    scheduledEnd: String(item.scheduledEnd ?? ""),
    classification: Number(item.classification ?? 0),
    maxParticipants: Number(item.maxParticipants ?? 50),
    sessionId: typeof item.sessionId === "string" ? item.sessionId : null,
    cancelledAt: typeof item.cancelledAt === "string" ? item.cancelledAt : null,
    createdAt: String(item.createdAt ?? ""),
    updatedAt: String(item.updatedAt ?? item.createdAt ?? ""),
  };
}

export async function listUpcomingCallSchedules(limit = 20, offset = 0) {
  const response = await authorizedBackendJson<{
    items: Array<Record<string, unknown>>;
    total: number;
  }>(`/calls/schedules?limit=${limit}&offset=${offset}`);

  return {
    items: response.items.map(normalizeSchedule),
    total: Number(response.total ?? response.items.length ?? 0),
  };
}

export async function getCallSession(id: string) {
  const response = await authorizedBackendJson<Record<string, unknown>>(`/calls/sessions/${id}`);
  return normalizeSession(response);
}

export async function initiatePortalCall(input: {
  channelId: string;
  title?: string;
  classification?: number;
  maxParticipants?: number;
}) {
  const response = await authorizedBackendJson<Record<string, unknown>>("/calls/sessions", {
    method: "POST",
    body: JSON.stringify(input),
  });

  return normalizeSession(response);
}

export async function joinPortalCall(id: string) {
  const response = await authorizedBackendJson<{
    session: Record<string, unknown>;
  }>(`/calls/sessions/${id}/join`, {
    method: "POST",
  });

  return normalizeSession(response.session);
}

export async function leavePortalCall(id: string) {
  await authorizedBackendJson<void>(`/calls/sessions/${id}/leave`, {
    method: "POST",
  });
}

export async function endPortalCall(id: string) {
  const response = await authorizedBackendJson<Record<string, unknown>>(`/calls/sessions/${id}`, {
    method: "DELETE",
  });

  return normalizeSession(response);
}

export async function startPortalCallRecording(id: string) {
  const response = await authorizedBackendJson<Record<string, unknown>>(
    `/calls/sessions/${id}/recordings`,
    {
      method: "POST",
    },
  );

  return normalizeRecording(response);
}

export async function stopPortalCallRecording(recordingId: string) {
  const response = await authorizedBackendJson<Record<string, unknown>>(
    `/calls/recordings/${recordingId}`,
    {
      method: "DELETE",
    },
  );

  return normalizeRecording(response);
}

export async function getPortalCallRecordingDownloadUrl(recordingId: string) {
  return authorizedBackendJson<{ url: string; expiresInSeconds: number }>(
    `/calls/recordings/${recordingId}/download-url`,
  );
}

export async function schedulePortalCall(input: {
  title: string;
  description?: string;
  channelId?: string;
  scheduledStart: string;
  scheduledEnd: string;
  classification?: number;
  maxParticipants?: number;
}) {
  const response = await authorizedBackendJson<Record<string, unknown>>("/calls/schedules", {
    method: "POST",
    body: JSON.stringify(input),
  });

  return normalizeSchedule(response);
}
