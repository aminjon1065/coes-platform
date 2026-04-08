import { NextResponse } from "next/server";
import { deleteFolder } from "@/lib/files";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function DELETE(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  await deleteFolder(id);
  return new NextResponse(null, { status: 204 });
}
