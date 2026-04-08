import { NextResponse } from "next/server";
import { getPresenceState } from "@/lib/chat";

type RouteContext = {
  params: Promise<{ userId: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const { userId } = await context.params;
  const state = await getPresenceState(userId);
  return NextResponse.json(state);
}
