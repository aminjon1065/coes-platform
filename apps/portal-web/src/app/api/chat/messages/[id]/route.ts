import { NextResponse } from "next/server";
import { deleteChatMessage, editChatMessage } from "@/lib/chat";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  const { id } = await context.params;
  const body = (await request.json()) as { body: string };
  const updated = await editChatMessage(id, body.body);
  return NextResponse.json(updated);
}

export async function DELETE(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  await deleteChatMessage(id);
  return new NextResponse(null, { status: 204 });
}
