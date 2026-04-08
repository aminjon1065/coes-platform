import { NextResponse } from "next/server";
import { listChatChannels } from "@/lib/chat";

export async function GET() {
  const channels = await listChatChannels();
  return NextResponse.json(channels);
}
