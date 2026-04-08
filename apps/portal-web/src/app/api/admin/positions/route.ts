import { NextRequest, NextResponse } from "next/server";
import { createPosition, listPositions } from "@/lib/admin";

export async function GET(request: NextRequest) {
  const departmentId = request.nextUrl.searchParams.get("departmentId") ?? undefined;
  const items = await listPositions(departmentId);
  return NextResponse.json(items);
}

export async function POST(request: NextRequest) {
  const body = (await request.json()) as {
    title: string;
    level: string;
    departmentId: string;
    reportsToId?: string;
    canAssignTasks?: boolean;
    canApproveDocuments?: boolean;
    canIssueResolutions?: boolean;
  };
  const created = await createPosition(body);
  return NextResponse.json(created, { status: 201 });
}
