import { NextResponse } from "next/server";
import { authorizedBackendJson } from "@/lib/auth";

export async function GET() {
  try {
    const data = await authorizedBackendJson("/notifications/telegram-subscription");
    return NextResponse.json(data);
  } catch {
    return NextResponse.json(null, { status: 200 });
  }
}

export async function DELETE() {
  try {
    await authorizedBackendJson("/notifications/telegram-subscription", {
      method: "DELETE",
    });
    return new NextResponse(null, { status: 204 });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to unlink Telegram";
    return NextResponse.json({ message }, { status: 400 });
  }
}
