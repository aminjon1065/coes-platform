import { NextResponse } from "next/server";
import { authorizedBackendJson } from "@/lib/auth";

export async function GET() {
  try {
    const data = await authorizedBackendJson<{ token: string; deepLink: string }>(
      "/notifications/telegram/link",
    );
    return NextResponse.json(data);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to generate link";
    return NextResponse.json({ message }, { status: 400 });
  }
}
