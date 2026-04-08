import { NextResponse } from "next/server";
import { revokeFilePermission } from "@/lib/files";

type RouteContext = {
  params: Promise<{ id: string; permissionId: string }>;
};

export async function DELETE(_request: Request, context: RouteContext) {
  const { id, permissionId } = await context.params;
  await revokeFilePermission(id, permissionId);
  return new NextResponse(null, { status: 204 });
}
