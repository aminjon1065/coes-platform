import { NextRequest, NextResponse } from "next/server";
import { triggerSearchReindex } from "@/lib/admin";

export async function POST(request: NextRequest) {
  const body = (await request.json()) as {
    indices?: string[];
    batchSize?: number;
    ensureIndices?: boolean;
    refresh?: boolean;
  };

  const result = await triggerSearchReindex(body);
  return NextResponse.json(result);
}
