import { NextResponse } from "next/server";
import { resolveGisIncident } from "@/lib/gis";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function PATCH(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  try {
    await resolveGisIncident(id);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "UNKNOWN";
    const status = message === "AUTH_REQUIRED" ? 401 : 500;
    return NextResponse.json(
      {
        message:
          status === 401 ? "Authentication required." : "Failed to resolve incident.",
      },
      { status },
    );
  }
}
