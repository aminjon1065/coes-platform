import { NextRequest, NextResponse } from "next/server";
import { listFiles } from "@/lib/files";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const result = await listFiles({
    folderId: searchParams.get("folderId") ?? undefined,
    search: searchParams.get("search") ?? undefined,
    scanStatus: searchParams.get("scanStatus") ?? undefined,
    limit: Number(searchParams.get("limit") ?? "50"),
    offset: Number(searchParams.get("offset") ?? "0"),
  });

  return NextResponse.json(result);
}
