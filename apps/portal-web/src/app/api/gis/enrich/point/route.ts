import { NextRequest, NextResponse } from "next/server";
import { enrichGisPoint } from "@/lib/gis";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const lon = Number(searchParams.get("lon"));
    const lat = Number(searchParams.get("lat"));
    const data = await enrichGisPoint(lon, lat);
    return NextResponse.json(data);
  } catch (error) {
    const message = error instanceof Error ? error.message : "UNKNOWN";
    const status = message === "AUTH_REQUIRED" ? 401 : 500;
    return NextResponse.json(
      { message: status === 401 ? "Authentication required." : "Failed to enrich point." },
      { status },
    );
  }
}
