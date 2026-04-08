import { NextResponse } from "next/server";
import { getEntityLinks } from "@/lib/files";

type RouteContext = {
  params: Promise<{ entityType: string; entityId: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const { entityType, entityId } = await context.params;
  const links = await getEntityLinks(entityType, entityId);
  return NextResponse.json(links);
}
