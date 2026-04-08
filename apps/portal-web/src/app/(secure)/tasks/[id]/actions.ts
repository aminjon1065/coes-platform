"use server";

import { revalidatePath } from "next/cache";
import { addTaskComment, transitionTask } from "@/lib/tasks";

export async function transitionTaskAction(formData: FormData) {
  const taskId = String(formData.get("taskId") ?? "");
  const targetStatus = String(formData.get("targetStatus") ?? "");
  const reason = String(formData.get("reason") ?? "").trim();
  const completionReport = String(formData.get("completionReport") ?? "").trim();
  const progressNote = String(formData.get("progressNote") ?? "").trim();
  const progressPercentRaw = String(formData.get("progressPercent") ?? "").trim();

  if (!taskId || !targetStatus) {
    return;
  }

  await transitionTask(taskId, {
    targetStatus,
    reason: reason || undefined,
    completionReport: completionReport || undefined,
    progressNote: progressNote || undefined,
    progressPercent: progressPercentRaw ? Number(progressPercentRaw) : undefined,
  });

  revalidatePath(`/tasks/${taskId}`);
  revalidatePath("/tasks");
  revalidatePath("/dashboard");
}

export async function addTaskCommentAction(formData: FormData) {
  const taskId = String(formData.get("taskId") ?? "");
  const body = String(formData.get("body") ?? "").trim();
  const isInternal = formData.get("isInternal") === "on";

  if (!taskId || !body) {
    return;
  }

  await addTaskComment(taskId, {
    body,
    isInternal,
  });

  revalidatePath(`/tasks/${taskId}`);
}
