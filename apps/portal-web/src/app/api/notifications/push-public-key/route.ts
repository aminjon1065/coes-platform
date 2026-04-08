import { NextResponse } from "next/server";
import { getBackendBaseUrl } from "@/lib/auth";

export async function GET() {
  try {
    const res = await fetch(`${getBackendBaseUrl()}/notifications/push-public-key`, {
      cache: "no-store",
    });
    const data = await res.json() as { publicKey: string };
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ publicKey: "" });
  }
}
