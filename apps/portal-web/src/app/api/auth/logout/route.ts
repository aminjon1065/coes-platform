import { NextResponse } from "next/server";
import { logoutAndClearSession } from "@/lib/auth";

export async function POST() {
  await logoutAndClearSession();
  return NextResponse.json({ ok: true });
}
