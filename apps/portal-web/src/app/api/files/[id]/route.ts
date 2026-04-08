import { NextResponse } from "next/server";
import { deleteFile, getFileDetail } from "@/lib/files";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  const detail = await getFileDetail(id);
  return NextResponse.json(detail);
}

export async function DELETE(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  await deleteFile(id);
  return new NextResponse(null, { status: 204 });
}
