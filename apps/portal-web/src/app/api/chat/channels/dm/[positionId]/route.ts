import { NextResponse } from "next/server";
import { getOrCreateDirectChannel } from "@/lib/chat";

type RouteContext = {
  params: Promise<{ positionId: string }>;
};

export async function POST(_request: Request, context: RouteContext) {
  const { positionId } = await context.params;
  const channel = await getOrCreateDirectChannel(positionId);
  return NextResponse.json(channel, { status: 200 });
}
