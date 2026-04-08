"use server";

import { verifyMfaAndCreateSession, verifyMfaBackupAndCreateSession } from "@/lib/auth";
import { redirect } from "next/navigation";

export async function verifyTotpAction(formData: FormData) {
  const code = String(formData.get("code") ?? "").trim();

  if (!/^\d{6}$/.test(code)) {
    redirect("/verify-mfa?error=invalid-code");
  }

  try {
    await verifyMfaAndCreateSession(code);
  } catch {
    redirect("/verify-mfa?error=invalid-code");
  }

  redirect("/dashboard");
}

export async function verifyBackupCodeAction(formData: FormData) {
  const code = String(formData.get("backup_code") ?? "").trim().toUpperCase();

  if (!/^[A-F0-9]{4}-[A-F0-9]{4}$/.test(code)) {
    redirect("/verify-mfa?mode=backup&error=invalid-code");
  }

  try {
    await verifyMfaBackupAndCreateSession(code);
  } catch {
    redirect("/verify-mfa?mode=backup&error=invalid-code");
  }

  redirect("/dashboard");
}
