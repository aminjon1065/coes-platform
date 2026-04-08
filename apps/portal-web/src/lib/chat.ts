import { authorizedBackendJson } from "./auth";

export type PortalChatChannel = {
  id: string;
  name: string;
  description: string | null;
  type: string;
  status: string;
  classification: number;
  linkedEntityId: string | null;
  linkedEntityType: string | null;
  updatedAt: string;
  unreadCount: number;
};

export type PortalChatMessage = {
  id: string;
  channelId: string;
  sequence: number;
  type: string;
  senderId: string;
  senderPositionId: string | null;
  senderLabel: string;
  body: string | null;
  attachments: Array<{
    fileId: string;
    fileName: string;
    mimeType?: string;
    fileSizeBytes?: number;
    classification: number;
  }>;
  parentMessageId: string | null;
  classification: number;
  isEdited: boolean;
  isDeleted: boolean;
  createdAt: string;
  updatedAt: string;
};

export type PortalChatChannelDetail = PortalChatChannel & {
  members: Array<{
    id: string;
    positionId: string;
    userId: string | null;
    role: string;
    status: string;
    joinSource: string;
    lastReadSequence: number;
  }>;
  messages: PortalChatMessage[];
};

export type PortalPresenceState = {
  userId: string;
  status: "online" | "away" | "busy" | "offline";
  lastSeen: string;
  currentDevice?: string;
};

function normalizeChannelType(type: string, linkedEntityType: string | null) {
  if (type === "direct") {
    return "Direct channel";
  }
  if (type === "group") {
    return "Group";
  }
  if (linkedEntityType === "task") {
    return "Task channel";
  }
  if (linkedEntityType === "document") {
    return "Document channel";
  }
  if (linkedEntityType === "department") {
    return "Department channel";
  }
  return type.replaceAll("_", " ");
}

function fallbackChannelName(channel: Record<string, unknown>) {
  const explicit = typeof channel.name === "string" && channel.name.trim() ? channel.name : null;
  if (explicit) {
    return explicit;
  }

  const type = String(channel.type ?? "channel");
  const linkedEntityType =
    typeof channel.linkedEntityType === "string" ? channel.linkedEntityType : null;
  return normalizeChannelType(type, linkedEntityType);
}

function normalizeMessage(
  message: Record<string, unknown>,
  senderLabels: Map<string, string>,
): PortalChatMessage {
  const senderId = String(message.senderId ?? "");
  return {
    id: String(message.id),
    channelId: String(message.channelId),
    sequence: Number(message.sequence ?? 0),
    type: String(message.type ?? "text"),
    senderId,
    senderPositionId:
      typeof message.senderPositionId === "string" ? message.senderPositionId : null,
    senderLabel: senderLabels.get(senderId) ?? senderId,
    body: typeof message.body === "string" ? message.body : null,
    attachments: Array.isArray(message.attachments)
      ? message.attachments.map((attachment) => ({
          fileId: String((attachment as Record<string, unknown>).fileId ?? ""),
          fileName: String((attachment as Record<string, unknown>).fileName ?? "Attachment"),
          mimeType:
            typeof (attachment as Record<string, unknown>).mimeType === "string"
              ? String((attachment as Record<string, unknown>).mimeType)
              : undefined,
          fileSizeBytes:
            typeof (attachment as Record<string, unknown>).fileSizeBytes === "number"
              ? Number((attachment as Record<string, unknown>).fileSizeBytes)
              : undefined,
          classification: Number(
            (attachment as Record<string, unknown>).classification ?? 0,
          ),
        }))
      : [],
    parentMessageId:
      typeof message.parentMessageId === "string" ? message.parentMessageId : null,
    classification: Number(message.classification ?? 0),
    isEdited: Boolean(message.isEdited),
    isDeleted: Boolean(message.isDeleted),
    createdAt: String(message.createdAt ?? ""),
    updatedAt: String(message.updatedAt ?? message.createdAt ?? ""),
  };
}

async function resolveSenderLabels(messages: Record<string, unknown>[]) {
  const credentialIds = Array.from(
    new Set(
      messages
        .map((message) =>
          typeof message.senderId === "string" ? message.senderId : null,
        )
        .filter((value): value is string => Boolean(value)),
    ),
  );

  if (credentialIds.length === 0) {
    return new Map<string, string>();
  }

  const response = await authorizedBackendJson<{
    items: Array<{ credentialId: string; displayName?: string; email?: string }>;
  }>("/users/resolve-by-credential", {
    method: "POST",
    body: JSON.stringify({ credentialIds }),
  });

  return new Map(
    response.items.map((item) => [
      item.credentialId,
      item.displayName ?? item.email ?? item.credentialId,
    ]),
  );
}

export async function listChatChannels() {
  const channels = await authorizedBackendJson<Record<string, unknown>[]>(
    "/chat/channels",
  );

  const enriched = await Promise.all(
    channels.map(async (channel) => {
      const unread = await authorizedBackendJson<number>(
        `/chat/channels/${String(channel.id)}/unread`,
      );

      return {
        id: String(channel.id),
        name: fallbackChannelName(channel),
        description:
          typeof channel.description === "string" ? channel.description : null,
        type: String(channel.type ?? "group"),
        status: String(channel.status ?? "active"),
        classification: Number(channel.classification ?? 0),
        linkedEntityId:
          typeof channel.linkedEntityId === "string" ? channel.linkedEntityId : null,
        linkedEntityType:
          typeof channel.linkedEntityType === "string" ? channel.linkedEntityType : null,
        updatedAt: String(channel.updatedAt ?? channel.createdAt ?? ""),
        unreadCount: unread,
      } satisfies PortalChatChannel;
    }),
  );

  return enriched;
}

export async function getChatChannelDetail(channelId: string) {
  const [channel, messages] = await Promise.all([
    authorizedBackendJson<Record<string, unknown>>(`/chat/channels/${channelId}`),
    authorizedBackendJson<Record<string, unknown>[]>(
      `/chat/channels/${channelId}/messages?limit=50`,
    ),
  ]);
  const senderLabels = await resolveSenderLabels(messages);
  const unreadCount = await authorizedBackendJson<number>(
    `/chat/channels/${channelId}/unread`,
  );

  return {
    id: String(channel.id),
    name: fallbackChannelName(channel),
    description: typeof channel.description === "string" ? channel.description : null,
    type: String(channel.type ?? "group"),
    status: String(channel.status ?? "active"),
    classification: Number(channel.classification ?? 0),
    linkedEntityId:
      typeof channel.linkedEntityId === "string" ? channel.linkedEntityId : null,
    linkedEntityType:
      typeof channel.linkedEntityType === "string" ? channel.linkedEntityType : null,
    updatedAt: String(channel.updatedAt ?? channel.createdAt ?? ""),
    unreadCount,
    members: Array.isArray(channel.members)
      ? channel.members.map((member) => ({
          id: String((member as Record<string, unknown>).id),
          positionId: String((member as Record<string, unknown>).positionId ?? ""),
          userId:
            typeof (member as Record<string, unknown>).userId === "string"
              ? String((member as Record<string, unknown>).userId)
              : null,
          role: String((member as Record<string, unknown>).role ?? "member"),
          status: String((member as Record<string, unknown>).status ?? "active"),
          joinSource: String((member as Record<string, unknown>).joinSource ?? "explicit"),
          lastReadSequence: Number(
            (member as Record<string, unknown>).lastReadSequence ?? 0,
          ),
        }))
      : [],
    messages: messages.map((message) => normalizeMessage(message, senderLabels)),
  } satisfies PortalChatChannelDetail;
}

export async function sendChatMessage(input: {
  channelId: string;
  body: string;
  parentMessageId?: string;
}) {
  const response = await authorizedBackendJson<Record<string, unknown>>(
    `/chat/channels/${input.channelId}/messages`,
    {
      method: "POST",
      body: JSON.stringify({
        body: input.body,
        parentMessageId: input.parentMessageId || undefined,
        idempotencyKey: `${input.channelId}:${Date.now()}:${Math.random()}`,
      }),
    },
  );

  const senderLabels = await resolveSenderLabels([response]);
  return normalizeMessage(response, senderLabels);
}

export async function markChatRead(channelId: string, sequence: number) {
  await authorizedBackendJson<void>(`/chat/channels/${channelId}/read`, {
    method: "POST",
    body: JSON.stringify({ sequence }),
  });
}

export async function createChatChannel(input: {
  name: string;
  classification: number;
  memberPositionIds: string[];
  retentionDays?: number;
}) {
  const channel = await authorizedBackendJson<Record<string, unknown>>("/chat/channels", {
    method: "POST",
    body: JSON.stringify({
      name: input.name,
      type: "group",
      classification: input.classification,
      memberPositionIds: input.memberPositionIds,
      retentionDays: input.retentionDays || undefined,
    }),
  });

  return {
    id: String(channel.id),
    name: fallbackChannelName(channel),
  };
}

export async function getOrCreateDirectChannel(targetPositionId: string) {
  const channel = await authorizedBackendJson<Record<string, unknown>>(
    `/chat/channels/dm/${targetPositionId}`,
    {
      method: "POST",
    },
  );

  return {
    id: String(channel.id),
    name: fallbackChannelName(channel),
  };
}

export async function editChatMessage(messageId: string, body: string) {
  const response = await authorizedBackendJson<Record<string, unknown>>(
    `/chat/messages/${messageId}`,
    {
      method: "PATCH",
      body: JSON.stringify({ body }),
    },
  );

  const senderLabels = await resolveSenderLabels([response]);
  return normalizeMessage(response, senderLabels);
}

export async function deleteChatMessage(messageId: string) {
  await authorizedBackendJson<void>(`/chat/messages/${messageId}`, {
    method: "DELETE",
  });
}

export async function getPresenceState(userId: string) {
  const response = await authorizedBackendJson<Record<string, unknown>>(
    `/chat/presence/${userId}`,
  );

  return {
    userId: String(response.userId ?? userId),
    status: String(response.status ?? "offline") as PortalPresenceState["status"],
    lastSeen: String(response.lastSeen ?? ""),
    currentDevice:
      typeof response.currentDevice === "string" ? response.currentDevice : undefined,
  } satisfies PortalPresenceState;
}

export async function getPresenceStates(userIds: string[]) {
  const unique = Array.from(new Set(userIds.filter(Boolean)));
  const states = await Promise.all(unique.map((userId) => getPresenceState(userId)));
  return new Map(states.map((state) => [state.userId, state]));
}

export async function setOwnPresence(status: PortalPresenceState["status"], device = "portal-web") {
  await authorizedBackendJson<void>("/chat/presence", {
    method: "POST",
    body: JSON.stringify({ status, device }),
  });
}

export async function sendPresenceHeartbeat() {
  await authorizedBackendJson<void>("/chat/presence/heartbeat", {
    method: "POST",
  });
}

export async function setChatTyping(channelId: string, isTyping: boolean) {
  await authorizedBackendJson<void>(`/chat/channels/${channelId}/typing`, {
    method: "POST",
    body: JSON.stringify({ isTyping }),
  });
}
