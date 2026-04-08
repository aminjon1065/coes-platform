import { NextRequest, NextResponse } from "next/server";
import { getArchivedDocumentsData } from "@/lib/edms";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const data = await getArchivedDocumentsData({
      search: searchParams.get("search") ?? undefined,
      reviewBefore: searchParams.get("reviewBefore") ?? undefined,
      limit: searchParams.get("limit") ? Number(searchParams.get("limit")) : undefined,
      offset: searchParams.get("offset") ? Number(searchParams.get("offset")) : undefined,
    });

    return NextResponse.json(data);
  } catch (error) {
    const message = error instanceof Error ? error.message : "UNKNOWN";
    const status = message === "AUTH_REQUIRED" ? 401 : 500;
    return NextResponse.json(
      { message: status === 401 ? "Authentication required." : "Failed to load archive." },
      { status },
    );
  }
}
