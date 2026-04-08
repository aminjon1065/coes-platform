import { NextResponse } from "next/server";
import { linkFileToEntity } from "@/lib/files";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  const { id } = await context.params;
  const body = (await request.json()) as {
    linkedEntityId: string;
    linkedEntityType: string;
  };
  const link = await linkFileToEntity({
    fileId: id,
    ...body,
  });
  return NextResponse.json(link, { status: 201 });
}
