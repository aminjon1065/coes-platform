import { NextRequest, NextResponse } from "next/server";
import { getDocumentDetailData, issueDocumentResolution } from "@/lib/edms";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(_request: NextRequest, context: RouteContext) {
  const { id } = await context.params;

  try {
    const data = await getDocumentDetailData(id);
    return NextResponse.json(data.resolutions);
  } catch (error) {
    const message = error instanceof Error ? error.message : "UNKNOWN";
    const status = message === "AUTH_REQUIRED" ? 401 : 500;
    return NextResponse.json(
      { message: status === 401 ? "Authentication required." : "Failed to load resolutions." },
      { status },
    );
  }
}

export async function POST(request: NextRequest, context: RouteContext) {
  const { id } = await context.params;

  try {
    const payload = await request.json();
    await issueDocumentResolution(id, payload);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "UNKNOWN";
    const status = message === "AUTH_REQUIRED" ? 401 : 500;
    return NextResponse.json(
      { message: status === 401 ? "Authentication required." : "Failed to issue resolution." },
      { status },
    );
  }
}
