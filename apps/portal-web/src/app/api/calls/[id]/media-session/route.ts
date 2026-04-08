import { NextResponse } from "next/server";
import { getSessionAccessToken, getSessionUser } from "@/lib/auth";
import { getCallSession } from "@/lib/calls";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

function getPortalMediaWsUrl() {
  return process.env.PORTAL_MEDIA_WS_URL ?? "ws://localhost:4002/ws";
}

function getMediaIceServers(): RTCIceServer[] {
  const stunUrl =
    process.env.PORTAL_MEDIA_STUN_URL ??
    process.env.NEXT_PUBLIC_MEDIA_STUN_URL ??
    "stun:127.0.0.1:3478";
  const turnUrl =
    process.env.PORTAL_MEDIA_TURN_URL ??
    process.env.NEXT_PUBLIC_MEDIA_TURN_URL ??
    "turn:127.0.0.1:3478?transport=udp";
  const turnsUrl =
    process.env.PORTAL_MEDIA_TURNS_URL ??
    process.env.NEXT_PUBLIC_MEDIA_TURNS_URL ??
    "turns:127.0.0.1:5349?transport=tcp";
  const username =
    process.env.COESCD_TURN_USER ??
    process.env.TURN_USER ??
    process.env.PORTAL_MEDIA_TURN_USERNAME;
  const credential =
    process.env.COESCD_TURN_PASSWORD ??
    process.env.TURN_PASSWORD ??
    process.env.PORTAL_MEDIA_TURN_PASSWORD;

  const servers: RTCIceServer[] = [{ urls: [stunUrl] }];

  if (username && credential) {
    servers.push({
      urls: [turnUrl, turnsUrl],
      username,
      credential,
    });
  }

  return servers;
}

export async function GET(_: Request, context: RouteContext) {
  const { id } = await context.params;
  const [accessToken, sessionUser, session] = await Promise.all([
    getSessionAccessToken(),
    getSessionUser(),
    getCallSession(id),
  ]);

  if (!accessToken || !sessionUser) {
    return NextResponse.json({ message: "AUTH_REQUIRED" }, { status: 401 });
  }

  return NextResponse.json({
    mediaWsUrl: getPortalMediaWsUrl(),
    iceServers: getMediaIceServers(),
    accessToken,
    sessionId: id,
    channelId: session.channelId,
    classification: session.classification,
    displayName: sessionUser.displayName,
  });
}
