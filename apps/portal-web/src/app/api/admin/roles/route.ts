import { NextRequest, NextResponse } from "next/server";
import { createRole, listRoles } from "@/lib/admin";

export async function GET() {
  const roles = await listRoles();
  return NextResponse.json(roles);
}

export async function POST(request: NextRequest) {
  const body = (await request.json()) as {
    name: string;
    description?: string;
    permissionNames: string[];
    parentRoleId?: string;
  };
  const created = await createRole(body);
  return NextResponse.json(created, { status: 201 });
}
