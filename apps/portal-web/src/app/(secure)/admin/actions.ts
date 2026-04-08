"use server";

import { revalidatePath } from "next/cache";
import {
  markOutboxDeadLetter,
  replayOutboxEvent,
  resetInboxMessage,
  retryInboxMessage,
  triggerSearchReindex,
} from "@/lib/admin";

export async function triggerSearchReindexAction(formData: FormData) {
  const indices = formData
    .getAll("indices")
    .map((value) => String(value).trim())
    .filter(Boolean);

  await triggerSearchReindex({
    indices,
    batchSize: Number(formData.get("batchSize") ?? 250),
    ensureIndices: formData.get("ensureIndices") === "on",
    refresh: formData.get("refresh") === "on",
  });

  revalidatePath("/admin");
  revalidatePath("/admin/system");
}

export async function replayOutboxEventAction(formData: FormData) {
  await replayOutboxEvent(String(formData.get("eventId") ?? ""));
  revalidatePath("/admin");
  revalidatePath("/admin/system");
}

export async function markOutboxDeadLetterAction(formData: FormData) {
  await markOutboxDeadLetter(String(formData.get("eventId") ?? ""));
  revalidatePath("/admin");
  revalidatePath("/admin/system");
}

export async function retryInboxMessageAction(formData: FormData) {
  await retryInboxMessage(String(formData.get("messageId") ?? ""));
  revalidatePath("/admin");
  revalidatePath("/admin/system");
}

export async function resetInboxMessageAction(formData: FormData) {
  await resetInboxMessage(String(formData.get("messageId") ?? ""));
  revalidatePath("/admin");
  revalidatePath("/admin/system");
}
