"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createChatChannel, getOrCreateDirectChannel } from "@/lib/chat";

export async function createChatChannelAction(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  const memberPositionIds = formData
    .getAll("memberPositionIds")
    .map((value) => String(value).trim())
    .filter(Boolean);

  if (!name || memberPositionIds.length === 0) {
    return;
  }

  const channel = await createChatChannel({
    name,
    classification: Number(formData.get("classification") ?? 1),
    retentionDays: Number(formData.get("retentionDays") ?? 0) || undefined,
    memberPositionIds,
  });

  revalidatePath("/chat");
  redirect(`/chat/${channel.id}`);
}

export async function createDirectChannelAction(formData: FormData) {
  const targetPositionId = String(formData.get("targetPositionId") ?? "").trim();
  if (!targetPositionId) {
    return;
  }

  const channel = await getOrCreateDirectChannel(targetPositionId);
  revalidatePath("/chat");
  redirect(`/chat/${channel.id}`);
}
