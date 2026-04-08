"use server";

import { revalidatePath } from "next/cache";
import { createRole, deleteRole } from "@/lib/admin";

export async function createRoleAction(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  if (!name) {
    return;
  }

  const permissionNames = formData
    .getAll("permissionNames")
    .map((value) => String(value).trim())
    .filter(Boolean);

  await createRole({
    name,
    description: String(formData.get("description") ?? "").trim() || undefined,
    parentRoleId: String(formData.get("parentRoleId") ?? "").trim() || undefined,
    permissionNames,
  });

  revalidatePath("/admin");
  revalidatePath("/admin/roles");
}

export async function deleteRoleAction(formData: FormData) {
  const roleId = String(formData.get("roleId") ?? "").trim();
  if (!roleId) {
    return;
  }

  await deleteRole(roleId);
  revalidatePath("/admin");
  revalidatePath("/admin/roles");
}
