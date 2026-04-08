import { NextRequest, NextResponse } from "next/server";
import { assignRoleToUser, listUserRoleAssignments } from "@/lib/admin";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(_request: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  const assignments = await listUserRoleAssignments(id);
  return NextResponse.json(assignments);
}

export async function POST(request: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  const body = (await request.json()) as {
    roleId: string;
    departmentScopeId?: string;
    positionId?: string;
    expiresAt?: string;
  };

  const assignment = await assignRoleToUser({
    credentialId: id,
    roleId: body.roleId,
    departmentScopeId: body.departmentScopeId,
    positionId: body.positionId,
    expiresAt: body.expiresAt,
  });
  return NextResponse.json(assignment, { status: 201 });
}
