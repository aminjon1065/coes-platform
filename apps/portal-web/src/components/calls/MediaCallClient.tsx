"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Device } from "mediasoup-client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

type ProducerDescriptor = {
  producerId: string;
  participantId: string;
  displayName: string;
  kind: "audio" | "video";
  source?: "camera" | "screen";
};

type ParticipantSnapshot = {
  participantId: string;
  userId?: string;
  displayName: string;
  audioMuted: boolean;
  videoMuted: boolean;
};

type RemoteConsumer = {
  consumerId: string;
  producerId: string;
  participantId: string;
  displayName: string;
  kind: "audio" | "video";
  source: "camera" | "screen";
  stream: MediaStream;
};

type MediaCallClientProps = {
  sessionId: string;
};

type PendingRequest = {
  resolve: (value: unknown) => void;
  reject: (reason?: unknown) => void;
};

function randomId() {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function MediaCallClient({ sessionId }: MediaCallClientProps) {
  const [status, setStatus] = useState<"idle" | "connecting" | "connected" | "failed" | "unsupported">("idle");
  const [error, setError] = useState<string | null>(null);
  const [participants, setParticipants] = useState<Record<string, ParticipantSnapshot>>({});
  const [remoteConsumers, setRemoteConsumers] = useState<Record<string, RemoteConsumer>>({});
  const [audioMuted, setAudioMuted] = useState(false);
  const [videoMuted, setVideoMuted] = useState(false);
  const [screenSharing, setScreenSharing] = useState(false);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);

  const socketRef = useRef<WebSocket | null>(null);
  const requestMapRef = useRef<Map<string, PendingRequest>>(new Map());
  const deviceRef = useRef<Device | null>(null);
  const sendTransportRef = useRef<any>(null);
  const recvTransportRef = useRef<any>(null);
  const screenProducerRef = useRef<any>(null);
  const currentProduceSourceRef = useRef<"camera" | "screen">("camera");
  const localTracksRef = useRef<{ audio?: MediaStreamTrack; video?: MediaStreamTrack }>({});
  const remoteProducerMapRef = useRef<Map<string, string>>(new Map());
  const localVideoRef = useRef<HTMLVideoElement | null>(null);

  const remoteVideoConsumers = useMemo(
    () => Object.values(remoteConsumers).filter((item) => item.kind === "video"),
    [remoteConsumers],
  );
  const remoteAudioConsumers = useMemo(
    () => Object.values(remoteConsumers).filter((item) => item.kind === "audio"),
    [remoteConsumers],
  );

  useEffect(() => {
    if (typeof window === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setStatus("unsupported");
      setError("Media devices API unavailable in this browser.");
      return;
    }

    let disposed = false;
    let currentLocalStream: MediaStream | null = null;

    async function connect() {
      setStatus("connecting");
      setError(null);

      try {
        const bootstrapResponse = await fetch(`/api/calls/${sessionId}/media-session`, {
          cache: "no-store",
        });
        if (!bootstrapResponse.ok) {
          throw new Error("Failed to get media session bootstrap.");
        }

        const bootstrap = (await bootstrapResponse.json()) as {
          mediaWsUrl: string;
          accessToken: string;
          channelId: string;
          classification: number;
          iceServers?: RTCIceServer[];
        };

        currentLocalStream = await navigator.mediaDevices.getUserMedia({
          audio: true,
          video: true,
        });
        if (disposed) {
          currentLocalStream.getTracks().forEach((track) => track.stop());
          return;
        }

        setLocalStream(currentLocalStream);
        localTracksRef.current = {
          audio: currentLocalStream.getAudioTracks()[0],
          video: currentLocalStream.getVideoTracks()[0],
        };

        const socket = new WebSocket(
          `${bootstrap.mediaWsUrl}?token=${encodeURIComponent(bootstrap.accessToken)}`,
        );
        socketRef.current = socket;

        const request = async (type: string, payload: Record<string, unknown>) => {
          const requestId = randomId();
          const message = JSON.stringify({ id: requestId, type, payload });

          return new Promise<any>((resolve, reject) => {
            requestMapRef.current.set(requestId, { resolve, reject });
            socket.send(message);
          });
        };

        const consumeProducer = async (descriptor: ProducerDescriptor) => {
          if (!recvTransportRef.current || !deviceRef.current || !descriptor.producerId) {
            return;
          }
          if (remoteProducerMapRef.current.has(descriptor.producerId)) {
            return;
          }

          const result = (await request("consume", {
            sessionId,
            producerId: descriptor.producerId,
            rtpCapabilities: deviceRef.current.rtpCapabilities,
          })) as {
            consumerId: string;
            producerId: string;
            kind: "audio" | "video";
            rtpParameters: unknown;
          };

          const consumer = await recvTransportRef.current.consume({
            id: result.consumerId,
            producerId: result.producerId,
            kind: result.kind,
            rtpParameters: result.rtpParameters,
          });

          remoteProducerMapRef.current.set(result.producerId, consumer.id);

          const stream = new MediaStream([consumer.track]);
          setRemoteConsumers((current) => ({
            ...current,
            [consumer.id]: {
              consumerId: consumer.id,
              producerId: result.producerId,
              participantId: descriptor.participantId,
              displayName: descriptor.displayName,
              kind: result.kind,
              source: descriptor.source ?? "camera",
              stream,
            },
          }));

          consumer.on("transportclose", () => {
            setRemoteConsumers((current) => {
              const next = { ...current };
              delete next[consumer.id];
              return next;
            });
            remoteProducerMapRef.current.delete(result.producerId);
          });
          consumer.on("producerclose", () => {
            setRemoteConsumers((current) => {
              const next = { ...current };
              delete next[consumer.id];
              return next;
            });
            remoteProducerMapRef.current.delete(result.producerId);
          });

          await request("resume_consumer", {
            sessionId,
            consumerId: consumer.id,
          });
        };

        socket.onmessage = async (event) => {
          let message: Record<string, unknown>;
          try {
            message = JSON.parse(String(event.data));
          } catch {
            return;
          }

          const id = typeof message.id === "string" ? message.id : "";
          if (id && requestMapRef.current.has(id)) {
            const pending = requestMapRef.current.get(id)!;
            requestMapRef.current.delete(id);
            if (typeof message.error === "string" && message.error) {
              pending.reject(new Error(message.error));
            } else {
              pending.resolve(message.payload);
            }
            return;
          }

          const type = typeof message.type === "string" ? message.type : "";
          const payload =
            message.payload && typeof message.payload === "object"
              ? (message.payload as Record<string, unknown>)
              : null;

          if (!payload) {
            return;
          }

          if (type === "participant_joined") {
            const participantId = String(payload.participantId ?? "");
            if (!participantId) {
              return;
            }
            setParticipants((current) => ({
              ...current,
              [participantId]: {
                participantId,
                userId: typeof payload.userId === "string" ? payload.userId : undefined,
                displayName: String(payload.displayName ?? participantId),
                audioMuted: Boolean(payload.audioMuted),
                videoMuted: Boolean(payload.videoMuted),
              },
            }));
            return;
          }

          if (type === "participant_left") {
            const participantId = String(payload.participantId ?? "");
            setParticipants((current) => {
              const next = { ...current };
              delete next[participantId];
              return next;
            });
            setRemoteConsumers((current) => {
              const next = { ...current };
              for (const [consumerId, consumer] of Object.entries(current)) {
                if (consumer.participantId === participantId) {
                  remoteProducerMapRef.current.delete(consumer.producerId);
                  delete next[consumerId];
                }
              }
              return next;
            });
            return;
          }

          if (type === "mute_changed") {
            const participantId = String(payload.participantId ?? "");
            if (!participantId) {
              return;
            }
            setParticipants((current) => ({
              ...current,
              [participantId]: {
                participantId,
                displayName: current[participantId]?.displayName ?? participantId,
                userId: current[participantId]?.userId,
                audioMuted:
                  typeof payload.audioMuted === "boolean"
                    ? payload.audioMuted
                    : current[participantId]?.audioMuted ?? false,
                videoMuted:
                  typeof payload.videoMuted === "boolean"
                    ? payload.videoMuted
                    : current[participantId]?.videoMuted ?? false,
              },
            }));
            return;
          }

          if (type === "moderator_mute") {
            const nextAudioMuted =
              typeof payload.audioMuted === "boolean"
                ? payload.audioMuted
                : localTracksRef.current.audio
                  ? !localTracksRef.current.audio.enabled
                  : false;
            const nextVideoMuted =
              typeof payload.videoMuted === "boolean"
                ? payload.videoMuted
                : localTracksRef.current.video
                  ? !localTracksRef.current.video.enabled
                  : false;
            setAudioMuted(nextAudioMuted);
            setVideoMuted(nextVideoMuted);
            if (localTracksRef.current.audio) {
              localTracksRef.current.audio.enabled = !nextAudioMuted;
            }
            if (localTracksRef.current.video) {
              localTracksRef.current.video.enabled = !nextVideoMuted;
            }
            return;
          }

          if (type === "moderator_kicked") {
            setStatus("failed");
            setError("You were removed from the session by a moderator.");
            socket.close();
            return;
          }

          if (type === "new_producer") {
            await consumeProducer({
              producerId: String(payload.producerId ?? ""),
              participantId: String(payload.participantId ?? ""),
              displayName: String(payload.displayName ?? payload.participantId ?? "Participant"),
              kind: String(payload.kind ?? "audio") as "audio" | "video",
              source:
                String(payload.source ?? "camera") === "screen" ? "screen" : "camera",
            });
          }
        };

        await new Promise<void>((resolve, reject) => {
          socket.onopen = () => resolve();
          socket.onerror = () => reject(new Error("Media signaling socket failed."));
          socket.onclose = () => {
            if (!disposed) {
              setStatus("failed");
              setError("Media signaling socket closed.");
            }
          };
        });

        const joinPayload = (await request("join", {
          sessionId,
          channelId: bootstrap.channelId,
          classification: bootstrap.classification,
        })) as {
          rtpCapabilities: unknown;
          participants?: ParticipantSnapshot[];
          producers?: ProducerDescriptor[];
        };

        const device = new Device();
        await device.load({ routerRtpCapabilities: joinPayload.rtpCapabilities as never });
        deviceRef.current = device;

        setParticipants(
          Object.fromEntries(
            (joinPayload.participants ?? []).map((participant) => [
              participant.participantId,
              participant,
            ]),
          ),
        );

        const sendTransportOptions = await request("create_send_transport", { sessionId });
        const sendTransport = device.createSendTransport({
          ...sendTransportOptions,
          iceServers: bootstrap.iceServers,
        });
        sendTransportRef.current = sendTransport;

        sendTransport.on("connect", ({ dtlsParameters }, callback, errback) => {
          request("connect_transport", {
            sessionId,
            transportId: sendTransport.id,
            dtlsParameters,
          })
            .then(() => callback())
            .catch((transportError) => errback(transportError as Error));
        });

        sendTransport.on("produce", ({ kind, rtpParameters }, callback, errback) => {
          request("produce", {
            sessionId,
            kind,
            rtpParameters,
            source: kind === "video" ? currentProduceSourceRef.current : "camera",
          })
            .then((result) => callback({ id: String(result.producerId) }))
            .catch((transportError) => errback(transportError as Error));
        });

        if (localTracksRef.current.audio) {
          await sendTransport.produce({ track: localTracksRef.current.audio });
        }
        if (localTracksRef.current.video) {
          await sendTransport.produce({ track: localTracksRef.current.video });
        }

        const recvTransportOptions = await request("create_recv_transport", { sessionId });
        const recvTransport = device.createRecvTransport({
          ...recvTransportOptions,
          iceServers: bootstrap.iceServers,
        });
        recvTransportRef.current = recvTransport;

        recvTransport.on("connect", ({ dtlsParameters }, callback, errback) => {
          request("connect_transport", {
            sessionId,
            transportId: recvTransport.id,
            dtlsParameters,
          })
            .then(() => callback())
            .catch((transportError) => errback(transportError as Error));
        });

        for (const producer of joinPayload.producers ?? []) {
          await consumeProducer(producer);
        }

        setStatus("connected");
      } catch (connectError) {
        setStatus("failed");
        setError(connectError instanceof Error ? connectError.message : "Media setup failed.");
      }
    }

    void connect();

    return () => {
      disposed = true;
      for (const pending of requestMapRef.current.values()) {
        pending.reject(new Error("Media client disposed"));
      }
      requestMapRef.current.clear();

      const socket = socketRef.current;
      if (socket?.readyState === WebSocket.OPEN) {
        socket.send(
          JSON.stringify({
            id: randomId(),
            type: "leave",
            payload: { sessionId },
          }),
        );
      }
      socket?.close();
      screenProducerRef.current?.close();
      sendTransportRef.current?.close();
      recvTransportRef.current?.close();
      currentLocalStream?.getTracks().forEach((track) => track.stop());
    };
  }, [sessionId]);

  useEffect(() => {
    if (localVideoRef.current && localStream) {
      localVideoRef.current.srcObject = localStream;
    }
  }, [localStream]);

  async function updateMute(nextAudioMuted: boolean, nextVideoMuted: boolean) {
    setAudioMuted(nextAudioMuted);
    setVideoMuted(nextVideoMuted);

    if (localTracksRef.current.audio) {
      localTracksRef.current.audio.enabled = !nextAudioMuted;
    }
    if (localTracksRef.current.video) {
      localTracksRef.current.video.enabled = !nextVideoMuted;
    }

    if (socketRef.current?.readyState === WebSocket.OPEN) {
      socketRef.current.send(
        JSON.stringify({
          id: randomId(),
          type: "set_mute",
          payload: {
            sessionId,
            audioMuted: nextAudioMuted,
            videoMuted: nextVideoMuted,
          },
        }),
      );
    }
  }

  async function toggleScreenShare() {
    if (!sendTransportRef.current) {
      return;
    }

    if (screenProducerRef.current) {
      screenProducerRef.current.close();
      screenProducerRef.current = null;
      setScreenSharing(false);
      return;
    }

    const displayStream = await navigator.mediaDevices.getDisplayMedia({
      video: true,
      audio: false,
    });
    const screenTrack = displayStream.getVideoTracks()[0];
    if (!screenTrack) {
      return;
    }

    currentProduceSourceRef.current = "screen";
    const producer = await sendTransportRef.current.produce({
      track: screenTrack,
      appData: { source: "screen" },
    });
    screenProducerRef.current = producer;
    setScreenSharing(true);
    currentProduceSourceRef.current = "camera";

    screenTrack.onended = () => {
      producer.close();
      screenProducerRef.current = null;
      setScreenSharing(false);
    };
  }

  return (
    <Card className="border-border/60 bg-white/90 shadow-sm">
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">Media</Badge>
            <Badge variant="secondary">{status}</Badge>
          </div>
          <div className="space-y-1">
            <CardTitle className="font-heading text-2xl">Audio and video room</CardTitle>
            <CardDescription>Browser media session and participant streams.</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {error ? (
          <div className="rounded-2xl border border-destructive/25 bg-destructive/5 px-4 py-3 text-sm text-destructive">
            Error: {error}
          </div>
        ) : null}

        <div className="flex flex-wrap gap-3">
          <Button type="button" variant="outline" onClick={() => void updateMute(!audioMuted, videoMuted)}>
            {audioMuted ? "Unmute audio" : "Mute audio"}
          </Button>
          <Button type="button" variant="outline" onClick={() => void updateMute(audioMuted, !videoMuted)}>
            {videoMuted ? "Enable video" : "Disable video"}
          </Button>
          <Button type="button" variant="outline" onClick={() => void toggleScreenShare()}>
            {screenSharing ? "Stop sharing" : "Share screen"}
          </Button>
        </div>

        <div className="grid gap-6 xl:grid-cols-2">
          <Card className="border-border/60 bg-background/80 shadow-none">
            <CardHeader>
              <CardTitle className="font-heading text-xl">Local preview</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <video
                ref={localVideoRef}
                autoPlay
                className="aspect-video w-full rounded-3xl border border-border/70 bg-slate-950 object-cover"
                muted
                playsInline
              />
              <p className="text-sm text-muted-foreground">
                {audioMuted ? "audio muted" : "audio live"} | {videoMuted ? "video muted" : "video live"}
              </p>
            </CardContent>
          </Card>

          <Card className="border-border/60 bg-background/80 shadow-none">
            <CardHeader>
              <CardTitle className="font-heading text-xl">Participants</CardTitle>
            </CardHeader>
            <CardContent>
              {Object.values(participants).length === 0 ? (
                <div className="rounded-2xl border border-dashed border-border/70 bg-muted/30 px-4 py-8 text-sm text-muted-foreground">
                  No remote participants yet.
                </div>
              ) : (
                <div className="space-y-3">
                  {Object.values(participants).map((participant) => (
                    <div key={participant.participantId} className="rounded-2xl border border-border/70 bg-white/70 p-4">
                      <p className="text-base font-semibold text-foreground">{participant.displayName}</p>
                      <p className="mt-2 text-sm text-muted-foreground">
                        {participant.audioMuted ? "audio muted" : "audio live"} |{" "}
                        {participant.videoMuted ? "video muted" : "video live"}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {remoteVideoConsumers.length > 0 ? (
          <div className="grid gap-6 md:grid-cols-2">
            {remoteVideoConsumers.map((consumer) => (
              <RemoteVideoTile consumer={consumer} key={consumer.consumerId} />
            ))}
          </div>
        ) : null}

        {remoteAudioConsumers.map((consumer) => (
          <audio
            autoPlay
            key={consumer.consumerId}
            ref={(node) => {
              if (node) {
                node.srcObject = consumer.stream;
              }
            }}
          />
        ))}
      </CardContent>
    </Card>
  );
}

function RemoteVideoTile({ consumer }: { consumer: RemoteConsumer }) {
  const ref = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    if (ref.current) {
      ref.current.srcObject = consumer.stream;
    }
  }, [consumer.stream]);

  return (
    <Card className="border-border/60 bg-background/80 shadow-none">
      <CardHeader>
        <div className="flex flex-wrap items-center gap-2">
          <CardTitle className="font-heading text-xl">{consumer.displayName}</CardTitle>
          <Badge variant="outline">{consumer.source === "screen" ? "screen share" : "camera"}</Badge>
        </div>
      </CardHeader>
      <CardContent>
        <video
          autoPlay
          className="aspect-video w-full rounded-3xl border border-border/70 bg-slate-950 object-cover"
          playsInline
          ref={ref}
        />
      </CardContent>
    </Card>
  );
}
