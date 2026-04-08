import { NextRequest, NextResponse } from "next/server";
import { loginAndCreateSession } from "@/lib/auth";

export async function POST(request: NextRequest) {
  const payload = (await request.json()) as {
    username?: string;
    password?: string;
  };

  const username = payload.username?.trim() ?? "";
  const password = payload.password ?? "";

  if (!username || !password) {
    return NextResponse.json(
      { message: "Username and password are required." },
      { status: 400 },
    );
  }

  try {
    const user = await loginAndCreateSession(username, password);
    return NextResponse.json({ ok: true, user });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Authentication failed.";
    return NextResponse.json({ message }, { status: 401 });
  }
}
