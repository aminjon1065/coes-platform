import { NextResponse } from "next/server";
import { getGisIncidentDetail } from "@/lib/gis";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  try {
    const data = await getGisIncidentDetail(id);
    return NextResponse.json(data);
  } catch (error) {
    const message = error instanceof Error ? error.message : "UNKNOWN";
    const status = message === "AUTH_REQUIRED" ? 401 : 500;
    return NextResponse.json(
      { message: status === 401 ? "Authentication required." : "Failed to load incident." },
      { status },
    );
  }
}
