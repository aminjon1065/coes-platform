import { NextRequest, NextResponse } from "next/server";
import { authorizedBackendJson } from "@/lib/auth";

export async function GET() {
  try {
    const data = await authorizedBackendJson("/notifications/preferences");
    return NextResponse.json(data);
  } catch {
    return NextResponse.json([], { status: 200 });
  }
}

export async function PATCH(request: NextRequest) {
  const body = await request.json();
  try {
    const data = await authorizedBackendJson("/notifications/preferences", {
      method: "PATCH",
      body: JSON.stringify(body),
    });
    return NextResponse.json(data);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to update preferences";
    return NextResponse.json({ message }, { status: 400 });
  }
}
