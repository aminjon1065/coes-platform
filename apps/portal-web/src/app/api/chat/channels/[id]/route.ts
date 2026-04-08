import { NextResponse } from "next/server";
import { getChatChannelDetail } from "@/lib/chat";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  const channel = await getChatChannelDetail(id);
  return NextResponse.json(channel);
}
