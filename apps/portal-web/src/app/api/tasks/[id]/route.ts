import { NextRequest, NextResponse } from "next/server";
import { getTaskDetailData } from "@/lib/tasks";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(_request: NextRequest, context: RouteContext) {
  const { id } = await context.params;

  try {
    const data = await getTaskDetailData(id);
    return NextResponse.json(data);
  } catch (error) {
    const message = error instanceof Error ? error.message : "UNKNOWN";
    const status = message === "AUTH_REQUIRED" ? 401 : 500;

    return NextResponse.json(
      { message: status === 401 ? "Authentication required." : "Failed to load task." },
      { status },
    );
  }
}
