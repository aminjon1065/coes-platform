import { NextResponse } from "next/server";
import { revokeUserRoleAssignment } from "@/lib/admin";

type RouteContext = {
  params: Promise<{ id: string; assignmentId: string }>;
};

export async function DELETE(_request: Request, context: RouteContext) {
  const { id, assignmentId } = await context.params;
  await revokeUserRoleAssignment(id, assignmentId);
  return NextResponse.json({ ok: true });
}
