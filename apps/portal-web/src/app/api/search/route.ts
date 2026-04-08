import { NextRequest, NextResponse } from "next/server";
import { PORTAL_SEARCH_INDICES, type PortalSearchIndex, runGlobalSearch } from "@/lib/search";

function parseIndices(values: string[]): PortalSearchIndex[] {
  const allowed = new Set(PORTAL_SEARCH_INDICES);
  return values.filter((value): value is PortalSearchIndex => allowed.has(value as PortalSearchIndex));
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const q = searchParams.get("q") ?? "";
  const limit = Number(searchParams.get("limit") ?? "20");
  const offset = Number(searchParams.get("offset") ?? "0");
  const indices = parseIndices(searchParams.getAll("indices"));

  if (!q.trim()) {
    return NextResponse.json({ total: 0, took: 0, hits: [] });
  }

  const result = await runGlobalSearch({
    q,
    limit: Number.isFinite(limit) ? limit : 20,
    offset: Number.isFinite(offset) ? offset : 0,
    indices: indices.length > 0 ? indices : undefined,
  });

  return NextResponse.json(result);
}
