import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";

function getGatewayWsUrl() {
  return process.env.PORTAL_GATEWAY_WS_URL ?? "ws://localhost:4001/ws";
}

export async function GET() {
  const session = await getSession();

  if (!session?.accessToken) {
    return NextResponse.json({ message: "Authentication required." }, { status: 401 });
  }

  return NextResponse.json({
    gatewayUrl: getGatewayWsUrl(),
    accessToken: session.accessToken,
  });
}
