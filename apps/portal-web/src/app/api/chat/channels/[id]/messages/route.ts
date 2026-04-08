import { NextResponse } from "next/server";
import { sendChatMessage } from "@/lib/chat";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  const { id } = await context.params;
  const body = (await request.json()) as { body: string; parentMessageId?: string };
  const message = await sendChatMessage({
    channelId: id,
    body: body.body,
    parentMessageId: body.parentMessageId,
  });
  return NextResponse.json(message, { status: 201 });
}
