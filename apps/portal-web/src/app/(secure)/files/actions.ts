"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getBackendBaseUrl, getSessionAccessToken } from "@/lib/auth";
import {
  createFolder,
  deleteFile,
  deleteFolder,
  grantFilePermission,
  linkFileToEntity,
  revokeFilePermission,
  unlinkFileFromEntity,
} from "@/lib/files";

export async function createFolderAction(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  if (!name) {
    return;
  }

  const parentId = String(formData.get("parentId") ?? "").trim() || undefined;

  await createFolder({
    name,
    parentId,
    classification: Number(formData.get("classification") ?? 1),
    description: String(formData.get("description") ?? "").trim() || undefined,
  });

  revalidatePath("/files");
}

export async function deleteFolderAction(formData: FormData) {
  const folderId = String(formData.get("folderId") ?? "").trim();
  if (!folderId) {
    return;
  }

  await deleteFolder(folderId);
  revalidatePath("/files");
}

export async function deleteFileAction(formData: FormData) {
  const fileId = String(formData.get("fileId") ?? "").trim();
  if (!fileId) {
    return;
  }

  await deleteFile(fileId);
  revalidatePath("/files");
}

export async function grantFilePermissionAction(formData: FormData) {
  const fileId = String(formData.get("fileId") ?? "").trim();
  const granteePositionId = String(formData.get("granteePositionId") ?? "").trim();
  const action = String(formData.get("action") ?? "").trim();

  if (!fileId || !granteePositionId || !action) {
    return;
  }

  await grantFilePermission({
    fileId,
    granteePositionId,
    action,
    effect: String(formData.get("effect") ?? "").trim() || undefined,
    expiresAt: String(formData.get("expiresAt") ?? "").trim() || undefined,
  });

  revalidatePath(`/files/${fileId}`);
}

export async function revokeFilePermissionAction(formData: FormData) {
  const fileId = String(formData.get("fileId") ?? "").trim();
  const permissionId = String(formData.get("permissionId") ?? "").trim();
  if (!fileId || !permissionId) {
    return;
  }

  await revokeFilePermission(fileId, permissionId);
  revalidatePath(`/files/${fileId}`);
}

export async function linkFileAction(formData: FormData) {
  const fileId = String(formData.get("fileId") ?? "").trim();
  const linkedEntityId = String(formData.get("linkedEntityId") ?? "").trim();
  const linkedEntityType = String(formData.get("linkedEntityType") ?? "").trim();

  if (!fileId || !linkedEntityId || !linkedEntityType) {
    return;
  }

  await linkFileToEntity({ fileId, linkedEntityId, linkedEntityType });
  revalidatePath(`/files/${fileId}`);
}

export async function unlinkFileAction(formData: FormData) {
  const fileId = String(formData.get("fileId") ?? "").trim();
  const linkedEntityId = String(formData.get("linkedEntityId") ?? "").trim();
  const linkedEntityType = String(formData.get("linkedEntityType") ?? "").trim();

  if (!fileId || !linkedEntityId || !linkedEntityType) {
    return;
  }

  await unlinkFileFromEntity({ fileId, linkedEntityId, linkedEntityType });
  revalidatePath(`/files/${fileId}`);
}

export async function uploadFileAction(formData: FormData) {
  const accessToken = await getSessionAccessToken();
  const file = formData.get("file");

  if (!accessToken || !(file instanceof File)) {
    return;
  }

  const outgoing = new FormData();
  outgoing.set("file", file, file.name);

  const params = new URLSearchParams();
  const folderId = String(formData.get("folderId") ?? "").trim();
  const displayName = String(formData.get("displayName") ?? "").trim();
  const classification = String(formData.get("classification") ?? "").trim();
  const uploadNote = String(formData.get("uploadNote") ?? "").trim();

  if (folderId) params.set("folderId", folderId);
  if (displayName) params.set("displayName", displayName);
  if (classification) params.set("classification", classification);
  if (uploadNote) params.set("uploadNote", uploadNote);

  const response = await fetch(
    `${getBackendBaseUrl()}/files/upload${params.toString() ? `?${params.toString()}` : ""}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      body: outgoing,
    },
  );

  if (!response.ok) {
    return;
  }

  revalidatePath("/files");
  redirect(folderId ? `/files?folder=${folderId}` : "/files");
}

export async function uploadFileVersionAction(formData: FormData) {
  const accessToken = await getSessionAccessToken();
  const file = formData.get("file");
  const fileId = String(formData.get("fileId") ?? "").trim();

  if (!accessToken || !fileId || !(file instanceof File)) {
    return;
  }

  const outgoing = new FormData();
  outgoing.set("file", file, file.name);

  const params = new URLSearchParams();
  const uploadNote = String(formData.get("uploadNote") ?? "").trim();
  if (uploadNote) {
    params.set("uploadNote", uploadNote);
  }

  const response = await fetch(
    `${getBackendBaseUrl()}/files/${fileId}/versions${params.toString() ? `?${params.toString()}` : ""}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      body: outgoing,
    },
  );

  if (!response.ok) {
    return;
  }

  revalidatePath(`/files/${fileId}`);
  revalidatePath("/files");
  redirect(`/files/${fileId}`);
}
