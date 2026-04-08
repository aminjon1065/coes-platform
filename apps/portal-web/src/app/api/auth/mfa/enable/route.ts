import { NextRequest, NextResponse } from "next/server";
import { authorizedBackendJson } from "@/lib/auth";

export async function POST(request: NextRequest) {
  const body = await request.json() as { token?: string };

  if (!body.token || !/^\d{6}$/.test(body.token)) {
    return NextResponse.json({ message: "Invalid token format" }, { status: 400 });
  }

  try {
    const data = await authorizedBackendJson<{ backupCodes: string[] }>(
      "/iam/mfa/enable",
      {
        method: "POST",
        body: JSON.stringify({ token: body.token }),
      },
    );
    return NextResponse.json(data);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to enable MFA";
    return NextResponse.json({ message }, { status: 400 });
  }
}
