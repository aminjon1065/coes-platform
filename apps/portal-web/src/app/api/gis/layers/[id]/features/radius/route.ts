import { NextRequest, NextResponse } from "next/server";
import { queryLayerFeaturesByRadius } from "@/lib/gis";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(request: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  try {
    const { searchParams } = request.nextUrl;
    const data = await queryLayerFeaturesByRadius({
      layerId: id,
      lon: Number(searchParams.get("lon")),
      lat: Number(searchParams.get("lat")),
      radiusMetres: Number(searchParams.get("radiusMetres")),
      limit: searchParams.get("limit") ? Number(searchParams.get("limit")) : undefined,
    });
    return NextResponse.json(data);
  } catch (error) {
    const message = error instanceof Error ? error.message : "UNKNOWN";
    const status = message === "AUTH_REQUIRED" ? 401 : 500;
    return NextResponse.json(
      { message: status === 401 ? "Authentication required." : "Failed to query radius." },
      { status },
    );
  }
}
