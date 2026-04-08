import { NextResponse } from "next/server";
import { setOwnPresence } from "@/lib/chat";

export async function POST(request: Request) {
  const body = (await request.json()) as {
    status: "online" | "away" | "busy" | "offline";
    device?: string;
  };
  await setOwnPresence(body.status, body.device);
  return new NextResponse(null, { status: 204 });
}
