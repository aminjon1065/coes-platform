import { NextResponse } from "next/server";
import { offboardAdminUser } from "@/lib/admin";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  await offboardAdminUser(id);
  return new NextResponse(null, { status: 204 });
}
