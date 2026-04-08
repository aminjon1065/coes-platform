import { NextResponse } from "next/server";
import { authorizedBackendJson } from "@/lib/auth";

export async function GET() {
  try {
    const data = await authorizedBackendJson<{ enabled: boolean; hasSetup: boolean }>(
      "/iam/mfa/status",
    );
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ enabled: false, hasSetup: false });
  }
}
