import { NextRequest, NextResponse } from "next/server";
import { getDocumentDetailData, updateDocument } from "@/lib/edms";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(_request: NextRequest, context: RouteContext) {
  const { id } = await context.params;

  try {
    const data = await getDocumentDetailData(id);
    return NextResponse.json(data);
  } catch (error) {
    const message = error instanceof Error ? error.message : "UNKNOWN";
    const status = message === "AUTH_REQUIRED" ? 401 : 500;
    return NextResponse.json(
      { message: status === 401 ? "Authentication required." : "Failed to load document." },
      { status },
    );
  }
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  const { id } = await context.params;

  try {
    const payload = await request.json();
    const document = await updateDocument(id, payload);
    return NextResponse.json(document);
  } catch (error) {
    const message = error instanceof Error ? error.message : "UNKNOWN";
    const status = message === "AUTH_REQUIRED" ? 401 : 500;
    return NextResponse.json(
      { message: status === 401 ? "Authentication required." : "Failed to update document." },
      { status },
    );
  }
}
