import { NextResponse } from "next/server";
import { getNotificationsData } from "@/lib/notifications";

export async function GET() {
  try {
    const data = await getNotificationsData();
    return NextResponse.json(data);
  } catch (error) {
    const message = error instanceof Error ? error.message : "UNKNOWN";
    const status = message === "AUTH_REQUIRED" ? 401 : 500;

    return NextResponse.json(
      {
        message:
          status === 401 ? "Authentication required." : "Failed to load notifications.",
      },
      { status },
    );
  }
}
