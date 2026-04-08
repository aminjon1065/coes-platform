"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { usePortalRealtimeRoom } from "@/components/realtime/usePortalRealtimeRoom";
import type {
  PortalChatChannelDetail,
  PortalChatMessage,
  PortalPresenceState,
} from "@/lib/chat";

type ChatThreadClientProps = {
  channel: PortalChatChannelDetail;
  currentCredentialId: string;
  initialPresence: Array<PortalPresenceState>;
};

function formatDateTime(value: string) {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString("en-GB");
}

function normalizeRealtimeMessage(
  payload: Record<string, unknown>,
  fallbackLabel = "Live user",
): PortalChatMessage {
  return {
    id: String(payload.id),
    channelId: String(payload.channelId),
    sequence: Number(payload.sequence ?? 0),
    type: String(payload.type ?? "text"),
    senderId: String(payload.senderId ?? ""),
    senderPositionId:
      typeof payload.senderPositionId === "string" ? payload.senderPositionId : null,
    senderLabel:
      typeof payload.senderLabel === "string"
        ? payload.senderLabel
        : String(payload.senderId ?? fallbackLabel),
    body: typeof payload.body === "string" ? payload.body : null,
    attachments: Array.isArray(payload.attachments)
      ? payload.attachments.map((attachment) => ({
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
      typeof payload.parentMessageId === "string" ? payload.parentMessageId : null,
    classification: Number(payload.classification ?? 0),
    isEdited: Boolean(payload.isEdited),
    isDeleted: Boolean(payload.isDeleted),
    createdAt: String(payload.createdAt ?? new Date().toISOString()),
    updatedAt: String(payload.updatedAt ?? payload.createdAt ?? new Date().toISOString()),
  };
}

function presenceLabel(state: PortalPresenceState | null | undefined) {
  return state?.status ?? "offline";
}

export function ChatThreadClient({
  channel,
  currentCredentialId,
  initialPresence,
}: ChatThreadClientProps) {
  const [messages, setMessages] = useState(channel.messages);
  const [body, setBody] = useState("");
  const [typingUsers, setTypingUsers] = useState<string[]>([]);
  const [presenceByUserId, setPresenceByUserId] = useState<Record<string, PortalPresenceState>>(
    Object.fromEntries(initialPresence.map((state) => [state.userId, state])),
  );
  const [isPending, startTransition] = useTransition();
  const typingStopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const highestSequence = useMemo(
    () => messages.reduce((max, message) => Math.max(max, message.sequence), 0),
    [messages],
  );

  usePortalRealtimeRoom({
    roomId: `chat.channel.${channel.id}`,
    onMessage(message) {
      const eventName =
        (typeof message.event === "string" ? message.event : undefined) ??
        (typeof message.type === "string" ? message.type : undefined);
      const payload =
        message.data && typeof message.data === "object"
          ? (message.data as Record<string, unknown>)
          : null;

      if (!payload) {
        return;
      }

      if (eventName === "chat.message.created") {
        const nextMessage = normalizeRealtimeMessage(payload);
        setMessages((current) => {
          if (current.some((messageItem) => messageItem.id === nextMessage.id)) {
            return current;
          }
          return [...current, nextMessage].sort((left, right) => left.sequence - right.sequence);
        });
      }

      if (eventName === "chat.message.edited") {
        setMessages((current) =>
          current.map((item) =>
            item.id === String(payload.id)
              ? {
                  ...item,
                  body: typeof payload.body === "string" ? payload.body : item.body,
                  isEdited: true,
                  updatedAt: String(payload.updatedAt ?? item.updatedAt),
                }
              : item,
          ),
        );
      }

      if (eventName === "chat.message.deleted") {
        setMessages((current) =>
          current.map((item) =>
            item.id === String(payload.id)
              ? {
                  ...item,
                  body: null,
                  attachments: [],
                  isDeleted: true,
                  updatedAt: String(payload.updatedAt ?? item.updatedAt),
                }
              : item,
          ),
        );
      }

      if (eventName === "chat.typing.started") {
        const userId = typeof payload.userId === "string" ? payload.userId : null;
        if (userId && userId !== currentCredentialId) {
          setTypingUsers((current) => (current.includes(userId) ? current : [...current, userId]));
        }
      }

      if (eventName === "chat.typing.stopped") {
        const userId = typeof payload.userId === "string" ? payload.userId : null;
        if (userId) {
          setTypingUsers((current) => current.filter((item) => item !== userId));
        }
      }
    },
  });

  usePortalRealtimeRoom({
    roomId: "chat.presence",
    onMessage(message) {
      const eventName =
        (typeof message.event === "string" ? message.event : undefined) ??
        (typeof message.type === "string" ? message.type : undefined);
      const payload =
        message.data && typeof message.data === "object"
          ? (message.data as Record<string, unknown>)
          : null;

      if (eventName !== "chat.presence.changed" || !payload) {
        return;
      }

      const userId = typeof payload.userId === "string" ? payload.userId : null;
      if (!userId) {
        return;
      }

      setPresenceByUserId((current) => ({
        ...current,
        [userId]: {
          userId,
          status:
            typeof payload.to === "string"
              ? (payload.to as PortalPresenceState["status"])
              : "offline",
          lastSeen: String(payload.lastSeen ?? ""),
          currentDevice:
            typeof payload.currentDevice === "string"
              ? payload.currentDevice
              : undefined,
        },
      }));
    },
  });

  useEffect(() => {
    if (highestSequence <= 0) {
      return;
    }

    void fetch(`/api/chat/channels/${channel.id}/read`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sequence: highestSequence }),
    }).catch(() => {});
  }, [channel.id, highestSequence]);

  useEffect(() => {
    void fetch("/api/chat/presence", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "online", device: "portal-web" }),
    }).catch(() => {});

    const heartbeatTimer = setInterval(() => {
      void fetch("/api/chat/presence/heartbeat", {
        method: "POST",
      }).catch(() => {});
    }, 60_000);

    return () => {
      clearInterval(heartbeatTimer);
      void fetch("/api/chat/presence", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "away", device: "portal-web" }),
      }).catch(() => {});
    };
  }, []);

  useEffect(() => {
    return () => {
      if (typingStopTimerRef.current) {
        clearTimeout(typingStopTimerRef.current);
      }
    };
  }, []);

  function scheduleTypingStop() {
    if (typingStopTimerRef.current) {
      clearTimeout(typingStopTimerRef.current);
    }

    typingStopTimerRef.current = setTimeout(() => {
      void fetch(`/api/chat/channels/${channel.id}/typing`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isTyping: false }),
      }).catch(() => {});
    }, 1500);
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextBody = body.trim();
    if (!nextBody) {
      return;
    }

    startTransition(async () => {
      const response = await fetch(`/api/chat/channels/${channel.id}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: nextBody }),
      });
      if (!response.ok) {
        return;
      }

      const message = (await response.json()) as PortalChatMessage;
      setMessages((current) => {
        if (current.some((item) => item.id === message.id)) {
          return current;
        }
        return [...current, message].sort((left, right) => left.sequence - right.sequence);
      });
      setBody("");
    });
  }

  async function handleEdit(messageId: string, currentBody: string | null) {
    const nextBody = window.prompt("Edit message", currentBody ?? "");
    if (!nextBody || nextBody.trim() === currentBody?.trim()) {
      return;
    }

    const response = await fetch(`/api/chat/messages/${messageId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body: nextBody.trim() }),
    });
    if (!response.ok) {
      return;
    }

    const updated = (await response.json()) as PortalChatMessage;
    setMessages((current) =>
      current.map((item) => (item.id === updated.id ? { ...item, ...updated } : item)),
    );
  }

  async function handleDelete(messageId: string) {
    const response = await fetch(`/api/chat/messages/${messageId}`, {
      method: "DELETE",
    });
    if (!response.ok) {
      return;
    }

    setMessages((current) =>
      current.map((item) =>
        item.id === messageId
          ? { ...item, body: null, attachments: [], isDeleted: true }
          : item,
      ),
    );
  }

  return (
    <div className="portal-stack">
      <section className="portal-panel chat-thread-panel">
        <div className="portal-section-head">
          <div>
            <span className="portal-pill">{channel.type}</span>
            <h2>{channel.name}</h2>
          </div>
          <p className="portal-note">
            {channel.members.length} members · unread {channel.unreadCount}
          </p>
        </div>
        <ul className="portal-list">
          {channel.members.map((member) => (
            <li key={member.id}>
              <div className="portal-row">
                <span>{member.userId ?? member.positionId}</span>
                <span className="portal-note">{presenceLabel(member.userId ? presenceByUserId[member.userId] : null)}</span>
              </div>
            </li>
          ))}
        </ul>
        {typingUsers.length > 0 ? (
          <p className="portal-note">Typing: {typingUsers.join(", ")}</p>
        ) : null}
        <ul className="portal-list chat-message-list">
          {messages.length === 0 ? (
            <li>No messages yet.</li>
          ) : (
            messages.map((message) => (
              <li key={message.id} className="chat-message-item">
                <div className="portal-row">
                  <div>
                    <strong>{message.senderLabel}</strong>
                    <p>{message.isDeleted ? "Message deleted" : message.body ?? "Attachment only"}</p>
                    <p className="portal-note">
                      #{message.sequence} · {formatDateTime(message.createdAt)}
                      {message.isEdited ? " · edited" : ""}
                    </p>
                    {message.senderId === currentCredentialId && !message.isDeleted ? (
                      <div className="portal-actions">
                        <button
                          className="portal-button secondary"
                          onClick={() => void handleEdit(message.id, message.body)}
                          type="button"
                        >
                          Edit
                        </button>
                        <button
                          className="portal-button secondary"
                          onClick={() => void handleDelete(message.id)}
                          type="button"
                        >
                          Delete
                        </button>
                      </div>
                    ) : null}
                  </div>
                </div>
              </li>
            ))
          )}
        </ul>
      </section>

      <section className="portal-panel">
        <form className="portal-form" onSubmit={handleSubmit}>
          <label>
            New message
            <textarea
              className="portal-input"
              name="body"
              onChange={(event) => {
                setBody(event.target.value);
                void fetch(`/api/chat/channels/${channel.id}/typing`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ isTyping: event.target.value.trim().length > 0 }),
                }).catch(() => {});
                scheduleTypingStop();
              }}
              placeholder="Send an operational message"
              rows={4}
              value={body}
            />
          </label>
          <div className="portal-actions">
            <button className="portal-button" disabled={isPending} type="submit">
              {isPending ? "Sending..." : "Send"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
