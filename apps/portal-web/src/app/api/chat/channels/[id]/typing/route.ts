import { NextResponse } from "next/server";
import { setChatTyping } from "@/lib/chat";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  const { id } = await context.params;
  const body = (await request.json()) as { isTyping: boolean };
  await setChatTyping(id, body.isTyping);
  return new NextResponse(null, { status: 204 });
}
