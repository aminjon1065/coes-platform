"use client";

import { useEffect, useRef, useState } from "react";

const INITIAL_RECONNECT_DELAY_MS = 3000;
const MAX_RECONNECT_DELAY_MS = 30000;

type UsePortalRealtimeRoomOptions = {
  roomId: string;
  onMessage: (message: Record<string, unknown>) => void;
};

export function usePortalRealtimeRoom({
  roomId,
  onMessage,
}: UsePortalRealtimeRoomOptions) {
  const reconnectDelayRef = useRef(INITIAL_RECONNECT_DELAY_MS);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const unmountedRef = useRef(false);
  const [status, setStatus] = useState<"connecting" | "live" | "offline">("connecting");
  const [lastEventAt, setLastEventAt] = useState<string | null>(null);

  useEffect(() => {
    unmountedRef.current = false;

    async function connect() {
      if (unmountedRef.current) {
        return;
      }

      setStatus("connecting");

      try {
        const response = await fetch("/api/realtime/ws-session", { cache: "no-store" });
        if (!response.ok) {
          setStatus("offline");
          return;
        }

        const { gatewayUrl, accessToken } = (await response.json()) as {
          gatewayUrl: string;
          accessToken: string;
        };

        const socket = new WebSocket(
          `${gatewayUrl}?token=${encodeURIComponent(accessToken)}`,
        );
        socketRef.current = socket;

        socket.onopen = () => {
          reconnectDelayRef.current = INITIAL_RECONNECT_DELAY_MS;
          setStatus("live");
          socket.send(
            JSON.stringify({
              type: "join_room",
              payload: { roomId },
            }),
          );
        };

        socket.onmessage = (event) => {
          try {
            const message = JSON.parse(event.data as string) as Record<string, unknown>;
            onMessage(message);
            setLastEventAt(new Date().toISOString());
          } catch {
            // Ignore malformed gateway payloads.
          }
        };

        socket.onerror = () => {
          setStatus("offline");
        };

        socket.onclose = () => {
          if (unmountedRef.current) {
            return;
          }

          setStatus("offline");
          reconnectTimerRef.current = setTimeout(() => {
            reconnectDelayRef.current = Math.min(
              reconnectDelayRef.current * 2,
              MAX_RECONNECT_DELAY_MS,
            );
            void connect();
          }, reconnectDelayRef.current);
        };
      } catch {
        setStatus("offline");
      }
    }

    void connect();

    return () => {
      unmountedRef.current = true;
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
      }
      socketRef.current?.close();
    };
  }, [onMessage, roomId]);

  return { status, lastEventAt };
}
