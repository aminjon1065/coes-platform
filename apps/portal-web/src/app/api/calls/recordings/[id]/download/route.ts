import { NextResponse } from "next/server";
import { getPortalCallRecordingDownloadUrl } from "@/lib/calls";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export async function GET(_: Request, context: RouteContext) {
  const { id } = await context.params;
  const { url } = await getPortalCallRecordingDownloadUrl(id);
  return NextResponse.redirect(url);
}
