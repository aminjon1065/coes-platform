import { NextResponse } from "next/server";
import { removeDocumentAttachment } from "@/lib/edms";

type RouteContext = {
  params: Promise<{ id: string; attachmentId: string }>;
};

export async function DELETE(_request: Request, context: RouteContext) {
  const { id, attachmentId } = await context.params;

  try {
    await removeDocumentAttachment(id, attachmentId);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "UNKNOWN";
    const status = message === "AUTH_REQUIRED" ? 401 : 500;
    return NextResponse.json(
      {
        message:
          status === 401 ? "Authentication required." : "Failed to remove attachment.",
      },
      { status },
    );
  }
}
