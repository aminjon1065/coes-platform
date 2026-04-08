import { NextRequest, NextResponse } from "next/server";
import { createDocument, getDocumentsData } from "@/lib/edms";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const data = await getDocumentsData({
      status: searchParams.get("status") ?? undefined,
      direction: searchParams.get("direction") ?? undefined,
      limit: searchParams.get("limit") ? Number(searchParams.get("limit")) : undefined,
      offset: searchParams.get("offset") ? Number(searchParams.get("offset")) : undefined,
    });

    return NextResponse.json(data);
  } catch (error) {
    const message = error instanceof Error ? error.message : "UNKNOWN";
    const status = message === "AUTH_REQUIRED" ? 401 : 500;
    return NextResponse.json(
      { message: status === 401 ? "Authentication required." : "Failed to load documents." },
      { status },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const payload = await request.json();
    const document = await createDocument(payload);
    return NextResponse.json(document, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "UNKNOWN";
    const status = message === "AUTH_REQUIRED" ? 401 : 500;
    return NextResponse.json(
      { message: status === 401 ? "Authentication required." : "Failed to create document." },
      { status },
    );
  }
}
