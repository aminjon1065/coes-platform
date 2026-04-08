import { NextRequest, NextResponse } from "next/server";
import { addDocumentAttachment } from "@/lib/edms";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(request: NextRequest, context: RouteContext) {
  const { id } = await context.params;

  try {
    const payload = await request.json();
    await addDocumentAttachment(id, payload);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "UNKNOWN";
    const status = message === "AUTH_REQUIRED" ? 401 : 500;
    return NextResponse.json(
      { message: status === 401 ? "Authentication required." : "Failed to add attachment." },
      { status },
    );
  }
}
