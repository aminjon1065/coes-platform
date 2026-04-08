import { NextResponse } from "next/server";
import { deleteRole } from "@/lib/admin";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function DELETE(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  await deleteRole(id);
  return new NextResponse(null, { status: 204 });
}
