"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
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
    <div className="space-y-6">
      <Card className="border-border/60 bg-white/90 shadow-sm">
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline">{channel.type}</Badge>
              <Badge variant="secondary">Unread {channel.unreadCount}</Badge>
            </div>
            <div className="space-y-1">
              <CardTitle className="font-heading text-2xl">{channel.name}</CardTitle>
              <CardDescription>{channel.members.length} members</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {channel.members.map((member) => (
              <div
                key={member.id}
                className="rounded-2xl border border-border/70 bg-background/80 px-3 py-2 text-sm"
              >
                <span className="font-medium text-foreground">
                  {member.userId ?? member.positionId}
                </span>
                <span className="ml-2 text-muted-foreground">
                  {presenceLabel(member.userId ? presenceByUserId[member.userId] : null)}
                </span>
              </div>
            ))}
          </div>
          {typingUsers.length > 0 ? (
            <p className="text-sm text-muted-foreground">Typing: {typingUsers.join(", ")}</p>
          ) : null}
          {messages.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border/70 bg-muted/30 px-4 py-8 text-sm text-muted-foreground">
              No messages yet.
            </div>
          ) : (
            <div className="space-y-4">
              {messages.map((message) => (
                <div key={message.id} className="rounded-3xl border border-border/70 bg-background/80 p-5">
                  <div className="flex items-start justify-between gap-4">
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-base font-semibold text-foreground">{message.senderLabel}</p>
                        {message.isDeleted ? <Badge variant="outline">deleted</Badge> : null}
                        {message.isEdited ? <Badge variant="secondary">edited</Badge> : null}
                      </div>
                      <p className="text-sm text-foreground">
                        {message.isDeleted ? "Message deleted" : message.body ?? "Attachment only"}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        #{message.sequence} | {formatDateTime(message.createdAt)}
                      </p>
                    </div>
                  </div>
                  {message.senderId === currentCredentialId && !message.isDeleted ? (
                    <div className="mt-4 flex flex-wrap gap-3">
                      <Button type="button" variant="outline" onClick={() => void handleEdit(message.id, message.body)}>
                        Edit
                      </Button>
                      <Button type="button" variant="outline" onClick={() => void handleDelete(message.id)}>
                        Delete
                      </Button>
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="border-border/60 bg-white/90 shadow-sm">
        <CardHeader>
          <CardTitle className="font-heading text-xl">New message</CardTitle>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={handleSubmit}>
            <Textarea
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
            <Button disabled={isPending} type="submit">
              {isPending ? "Sending..." : "Send"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
