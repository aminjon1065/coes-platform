"use server";

import { revalidatePath } from "next/cache";
import { createDepartment } from "@/lib/admin";

export async function createDepartmentAction(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  const code = String(formData.get("code") ?? "").trim();

  if (!name || !code) {
    return;
  }

  await createDepartment({
    name,
    code,
    parentDepartmentId:
      String(formData.get("parentDepartmentId") ?? "").trim() || undefined,
  });

  revalidatePath("/admin");
  revalidatePath("/admin/departments");
}
