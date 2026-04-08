import { NextResponse } from "next/server";
import { vacateUserPosition } from "@/lib/admin";

type RouteContext = {
  params: Promise<{ id: string; positionId: string }>;
};

export async function DELETE(_request: Request, context: RouteContext) {
  const { id, positionId } = await context.params;
  await vacateUserPosition(id, positionId);
  return NextResponse.json({ ok: true });
}
