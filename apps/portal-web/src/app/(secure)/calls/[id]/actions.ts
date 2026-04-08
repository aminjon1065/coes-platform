"use server";

import { revalidatePath } from "next/cache";
import { authorizedBackendJson } from "@/lib/auth";

export async function moderateParticipantAction(formData: FormData) {
  const sessionId = String(formData.get("sessionId") ?? "").trim();
  const participantId = String(formData.get("participantId") ?? "").trim();
  if (!sessionId || !participantId) {
    return;
  }

  const audioMutedValue = String(formData.get("audioMuted") ?? "").trim();
  const videoMutedValue = String(formData.get("videoMuted") ?? "").trim();

  await authorizedBackendJson<void>(`/calls/sessions/${sessionId}/participants/${participantId}/mute`, {
    method: "POST",
    body: JSON.stringify({
      audioMuted: audioMutedValue ? audioMutedValue === "true" : undefined,
      videoMuted: videoMutedValue ? videoMutedValue === "true" : undefined,
    }),
  });

  revalidatePath(`/calls/${sessionId}`);
}

export async function removeParticipantAction(formData: FormData) {
  const sessionId = String(formData.get("sessionId") ?? "").trim();
  const participantId = String(formData.get("participantId") ?? "").trim();
  if (!sessionId || !participantId) {
    return;
  }

  await authorizedBackendJson<void>(`/calls/sessions/${sessionId}/participants/${participantId}`, {
    method: "DELETE",
  });

  revalidatePath(`/calls/${sessionId}`);
}
