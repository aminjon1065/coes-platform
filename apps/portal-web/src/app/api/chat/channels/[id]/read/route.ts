import { NextResponse } from "next/server";
import { markChatRead } from "@/lib/chat";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  const { id } = await context.params;
  const body = (await request.json()) as { sequence: number };
  await markChatRead(id, body.sequence);
  return new NextResponse(null, { status: 204 });
}
