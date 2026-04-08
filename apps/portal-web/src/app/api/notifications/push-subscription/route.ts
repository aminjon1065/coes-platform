import { NextRequest, NextResponse } from "next/server";
import { authorizedBackendJson } from "@/lib/auth";

export async function GET() {
  try {
    const data = await authorizedBackendJson("/notifications/push-subscription");
    return NextResponse.json(data);
  } catch {
    return NextResponse.json([], { status: 200 });
  }
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  try {
    const data = await authorizedBackendJson("/notifications/push-subscription", {
      method: "POST",
      body: JSON.stringify(body),
    });
    return NextResponse.json(data, { status: 201 });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to register subscription";
    return NextResponse.json({ message }, { status: 400 });
  }
}

export async function DELETE(request: NextRequest) {
  const body = await request.json() as { endpoint: string };
  try {
    await authorizedBackendJson("/notifications/push-subscription", {
      method: "DELETE",
      body: JSON.stringify(body),
    });
    return new NextResponse(null, { status: 204 });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to remove subscription";
    return NextResponse.json({ message }, { status: 400 });
  }
}
