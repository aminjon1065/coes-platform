import { NextRequest, NextResponse } from "next/server";
import { getDownloadUrl } from "@/lib/files";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(request: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  const expirySeconds = Number(request.nextUrl.searchParams.get("expirySeconds") ?? "3600");
  const result = await getDownloadUrl(id, expirySeconds);
  return NextResponse.json(result);
}
