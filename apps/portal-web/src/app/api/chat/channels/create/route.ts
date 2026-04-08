import { NextResponse } from "next/server";
import { createChatChannel } from "@/lib/chat";

export async function POST(request: Request) {
  const body = (await request.json()) as {
    name: string;
    classification: number;
    memberPositionIds: string[];
    retentionDays?: number;
  };
  const channel = await createChatChannel(body);
  return NextResponse.json(channel, { status: 201 });
}
