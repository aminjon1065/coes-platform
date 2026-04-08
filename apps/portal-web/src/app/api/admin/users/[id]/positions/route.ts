import { NextRequest, NextResponse } from "next/server";
import { assignPositionToUser, listUserPositionAssignments } from "@/lib/admin";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(_request: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  const assignments = await listUserPositionAssignments(id);
  return NextResponse.json(assignments);
}

export async function POST(request: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  const body = (await request.json()) as {
    positionId: string;
    type?: string;
    assignedAt?: string;
    notes?: string;
  };

  const assignment = await assignPositionToUser({
    userId: id,
    positionId: body.positionId,
    type: body.type,
    assignedAt: body.assignedAt,
    notes: body.notes,
  });
  return NextResponse.json(assignment, { status: 201 });
}
