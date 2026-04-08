"use server";

import { revalidatePath } from "next/cache";
import { createPosition } from "@/lib/admin";

export async function createPositionAction(formData: FormData) {
  const title = String(formData.get("title") ?? "").trim();
  const level = String(formData.get("level") ?? "").trim();
  const departmentId = String(formData.get("departmentId") ?? "").trim();

  if (!title || !level || !departmentId) {
    return;
  }

  await createPosition({
    title,
    level,
    departmentId,
    reportsToId: String(formData.get("reportsToId") ?? "").trim() || undefined,
    canAssignTasks: formData.get("canAssignTasks") === "on",
    canApproveDocuments: formData.get("canApproveDocuments") === "on",
    canIssueResolutions: formData.get("canIssueResolutions") === "on",
  });

  revalidatePath("/admin");
  revalidatePath("/admin/positions");
}
