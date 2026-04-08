import { NextResponse } from "next/server";
import { unlinkFileFromEntity } from "@/lib/files";

type RouteContext = {
  params: Promise<{ id: string; entityType: string; entityId: string }>;
};

export async function DELETE(_request: Request, context: RouteContext) {
  const { id, entityType, entityId } = await context.params;
  await unlinkFileFromEntity({
    fileId: id,
    linkedEntityType: entityType,
    linkedEntityId: entityId,
  });
  return new NextResponse(null, { status: 204 });
}
