import { NextResponse } from "next/server";
import { getSearchHealth } from "@/lib/admin";

export async function GET() {
  const health = await getSearchHealth();
  return NextResponse.json(health);
}
