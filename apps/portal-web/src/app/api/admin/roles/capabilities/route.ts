import { NextResponse } from "next/server";
import { listCapabilities } from "@/lib/admin";

export async function GET() {
  const capabilities = await listCapabilities();
  return NextResponse.json(capabilities);
}
