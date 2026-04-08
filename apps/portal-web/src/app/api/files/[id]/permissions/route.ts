import { NextResponse } from "next/server";
import { grantFilePermission } from "@/lib/files";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  const { id } = await context.params;
  const body = (await request.json()) as {
    granteePositionId: string;
    action: string;
    effect?: string;
    expiresAt?: string;
  };
  const permission = await grantFilePermission({
    fileId: id,
    ...body,
  });
  return NextResponse.json(permission, { status: 201 });
}
