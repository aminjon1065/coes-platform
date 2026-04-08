import { NextRequest, NextResponse } from "next/server";
import { reportGisIncident } from "@/lib/gis";

export async function POST(request: NextRequest) {
  try {
    const payload = await request.json();
    await reportGisIncident(payload);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "UNKNOWN";
    const status = message === "AUTH_REQUIRED" ? 401 : 500;
    return NextResponse.json(
      { message: status === 401 ? "Authentication required." : "Failed to report incident." },
      { status },
    );
  }
}
