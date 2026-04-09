import { NextResponse } from "next/server";
import { logoutAndClearSession } from "@/lib/auth";

export async function POST() {
  await logoutAndClearSession();
  // Browser form submissions follow the redirect; fetch clients can check for 302.
  return NextResponse.redirect(new URL("/login", process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000"), { status: 302 });
}
