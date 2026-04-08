"use server";

import { revalidatePath } from "next/cache";
import { createAdminUser, offboardAdminUser } from "@/lib/admin";

export async function createAdminUserAction(formData: FormData) {
  const username = String(formData.get("username") ?? "").trim();
  const password = String(formData.get("password") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const firstName = String(formData.get("firstName") ?? "").trim();
  const lastName = String(formData.get("lastName") ?? "").trim();

  if (!username || !password || !email || !firstName || !lastName) {
    return;
  }

  await createAdminUser({
    username,
    password,
    email,
    firstName,
    lastName,
    middleName: String(formData.get("middleName") ?? "").trim() || undefined,
    displayName: String(formData.get("displayName") ?? "").trim() || undefined,
    phone: String(formData.get("phone") ?? "").trim() || undefined,
    clearanceLevel: Number(formData.get("clearanceLevel") ?? 0),
  });

  revalidatePath("/admin");
  revalidatePath("/admin/users");
}

export async function offboardAdminUserAction(formData: FormData) {
  const userId = String(formData.get("userId") ?? "").trim();
  if (!userId) {
    return;
  }

  await offboardAdminUser(userId);
  revalidatePath("/admin");
  revalidatePath("/admin/users");
}
