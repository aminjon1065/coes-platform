import { NextRequest, NextResponse } from "next/server";
import { queryLayerFeaturesByBbox } from "@/lib/gis";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(request: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  try {
    const { searchParams } = request.nextUrl;
    const data = await queryLayerFeaturesByBbox({
      layerId: id,
      minLon: Number(searchParams.get("minLon")),
      minLat: Number(searchParams.get("minLat")),
      maxLon: Number(searchParams.get("maxLon")),
      maxLat: Number(searchParams.get("maxLat")),
      limit: searchParams.get("limit") ? Number(searchParams.get("limit")) : undefined,
    });
    return NextResponse.json(data);
  } catch (error) {
    const message = error instanceof Error ? error.message : "UNKNOWN";
    const status = message === "AUTH_REQUIRED" ? 401 : 500;
    return NextResponse.json(
      { message: status === 401 ? "Authentication required." : "Failed to query features." },
      { status },
    );
  }
}
