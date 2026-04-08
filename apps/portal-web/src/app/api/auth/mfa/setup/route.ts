import { NextResponse } from "next/server";
import { authorizedBackendJson } from "@/lib/auth";

export async function POST() {
  try {
    const data = await authorizedBackendJson<{
      secret: string;
      qrCodeDataUri: string;
      otpauthUri: string;
    }>("/iam/mfa/setup", { method: "POST" });

    return NextResponse.json(data);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to init MFA setup";
    return NextResponse.json({ message }, { status: 400 });
  }
}
