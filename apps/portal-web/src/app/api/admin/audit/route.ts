import { NextRequest, NextResponse } from "next/server";
import { listAuditEvents } from "@/lib/admin";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const result = await listAuditEvents({
    actorId: searchParams.get("actorId") ?? undefined,
    eventType: searchParams.get("eventType") ?? undefined,
    resourceType: searchParams.get("resourceType") ?? undefined,
    severity: searchParams.get("severity") ?? undefined,
    limit: searchParams.get("limit") ? Number(searchParams.get("limit")) : undefined,
    offset: searchParams.get("offset") ? Number(searchParams.get("offset")) : undefined,
  });

  return NextResponse.json(result);
}
