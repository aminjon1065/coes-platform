"use server";

import { loginAndCreateSession } from "@/lib/auth";
import { redirect } from "next/navigation";

export async function loginAction(formData: FormData) {
  const username = String(formData.get("username") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!username || !password) {
    redirect("/login?error=missing-credentials");
  }

  let outcome: Awaited<ReturnType<typeof loginAndCreateSession>>;

  try {
    outcome = await loginAndCreateSession(username, password);
  } catch {
    redirect("/login?error=invalid-credentials");
  }

  if (outcome.status === "mfa_required") {
    redirect("/verify-mfa");
  }

  redirect("/dashboard");
}
