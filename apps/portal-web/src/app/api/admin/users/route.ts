import { NextRequest, NextResponse } from "next/server";
import { createAdminUser, listAdminUsers } from "@/lib/admin";

export async function GET(request: NextRequest) {
  const search = request.nextUrl.searchParams.get("search") ?? undefined;
  const result = await listAdminUsers(search);
  return NextResponse.json(result);
}

export async function POST(request: NextRequest) {
  const body = (await request.json()) as {
    username: string;
    password: string;
    email: string;
    firstName: string;
    lastName: string;
    middleName?: string;
    displayName?: string;
    phone?: string;
    clearanceLevel: number;
  };
  const created = await createAdminUser(body);
  return NextResponse.json(created, { status: 201 });
}
