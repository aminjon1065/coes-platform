import { NextResponse } from "next/server";
import { getGisSummaryData } from "@/lib/gis";

export async function GET() {
  try {
    const data = await getGisSummaryData();
    return NextResponse.json(data);
  } catch (error) {
    const message = error instanceof Error ? error.message : "UNKNOWN";
    const status = message === "AUTH_REQUIRED" ? 401 : 500;
    return NextResponse.json(
      { message: status === 401 ? "Authentication required." : "Failed to load GIS summary." },
      { status },
    );
  }
}
