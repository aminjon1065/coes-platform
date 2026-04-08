import { NextResponse } from "next/server";
import { markAllNotificationsRead } from "@/lib/notifications";

export async function POST() {
  try {
    const result = await markAllNotificationsRead();
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "UNKNOWN";
    const status = message === "AUTH_REQUIRED" ? 401 : 500;

    return NextResponse.json(
      {
        message:
          status === 401 ? "Authentication required." : "Failed to mark all as read.",
      },
      { status },
    );
  }
}
