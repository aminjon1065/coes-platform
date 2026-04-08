"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  endPortalCall,
  initiatePortalCall,
  joinPortalCall,
  leavePortalCall,
  schedulePortalCall,
  startPortalCallRecording,
  stopPortalCallRecording,
} from "@/lib/calls";

function toOptionalString(value: FormDataEntryValue | null) {
  const normalized = String(value ?? "").trim();
  return normalized || undefined;
}

function toOptionalNumber(value: FormDataEntryValue | null) {
  const normalized = String(value ?? "").trim();
  if (!normalized) {
    return undefined;
  }

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export async function initiateCallAction(formData: FormData) {
  const channelId = String(formData.get("channelId") ?? "").trim();
  if (!channelId) {
    return;
  }

  const session = await initiatePortalCall({
    channelId,
    title: toOptionalString(formData.get("title")),
    classification: toOptionalNumber(formData.get("classification")),
    maxParticipants: toOptionalNumber(formData.get("maxParticipants")),
  });

  revalidatePath("/calls");
  redirect(`/calls/${session.id}`);
}

export async function scheduleCallAction(formData: FormData) {
  const title = String(formData.get("title") ?? "").trim();
  const scheduledStart = String(formData.get("scheduledStart") ?? "").trim();
  const scheduledEnd = String(formData.get("scheduledEnd") ?? "").trim();

  if (!title || !scheduledStart || !scheduledEnd) {
    return;
  }

  await schedulePortalCall({
    title,
    description: toOptionalString(formData.get("description")),
    channelId: toOptionalString(formData.get("channelId")),
    scheduledStart,
    scheduledEnd,
    classification: toOptionalNumber(formData.get("classification")),
    maxParticipants: toOptionalNumber(formData.get("maxParticipants")),
  });

  revalidatePath("/calls");
}

export async function joinCallAction(formData: FormData) {
  const sessionId = String(formData.get("sessionId") ?? "").trim();
  if (!sessionId) {
    return;
  }

  await joinPortalCall(sessionId);
  revalidatePath("/calls");
  revalidatePath(`/calls/${sessionId}`);
}

export async function leaveCallAction(formData: FormData) {
  const sessionId = String(formData.get("sessionId") ?? "").trim();
  if (!sessionId) {
    return;
  }

  await leavePortalCall(sessionId);
  revalidatePath("/calls");
  revalidatePath(`/calls/${sessionId}`);
}

export async function endCallAction(formData: FormData) {
  const sessionId = String(formData.get("sessionId") ?? "").trim();
  if (!sessionId) {
    return;
  }

  await endPortalCall(sessionId);
  revalidatePath("/calls");
  revalidatePath(`/calls/${sessionId}`);
}

export async function startCallRecordingAction(formData: FormData) {
  const sessionId = String(formData.get("sessionId") ?? "").trim();
  if (!sessionId) {
    return;
  }

  await startPortalCallRecording(sessionId);
  revalidatePath(`/calls/${sessionId}`);
}

export async function stopCallRecordingAction(formData: FormData) {
  const sessionId = String(formData.get("sessionId") ?? "").trim();
  const recordingId = String(formData.get("recordingId") ?? "").trim();
  if (!sessionId || !recordingId) {
    return;
  }

  await stopPortalCallRecording(recordingId);
  revalidatePath(`/calls/${sessionId}`);
}
