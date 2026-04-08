import { NextResponse } from "next/server";
import { sendPresenceHeartbeat } from "@/lib/chat";

export async function POST() {
  await sendPresenceHeartbeat();
  return new NextResponse(null, { status: 204 });
}
