"use server";

import { revalidatePath } from "next/cache";
import {
  assignPositionToUser,
  assignRoleToUser,
  createAdminUser,
  offboardAdminUser,
  revokeUserRoleAssignment,
  vacateUserPosition,
} from "@/lib/admin";

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

export async function assignUserRoleAction(formData: FormData) {
  const credentialId = String(formData.get("credentialId") ?? "").trim();
  const roleId = String(formData.get("roleId") ?? "").trim();

  if (!credentialId || !roleId) {
    return;
  }

  await assignRoleToUser({
    credentialId,
    roleId,
    departmentScopeId: String(formData.get("departmentScopeId") ?? "").trim() || undefined,
    expiresAt: String(formData.get("expiresAt") ?? "").trim() || undefined,
  });

  revalidatePath("/admin");
  revalidatePath("/admin/users");
}

export async function revokeUserRoleAssignmentAction(formData: FormData) {
  const credentialId = String(formData.get("credentialId") ?? "").trim();
  const assignmentId = String(formData.get("assignmentId") ?? "").trim();

  if (!credentialId || !assignmentId) {
    return;
  }

  await revokeUserRoleAssignment(credentialId, assignmentId);
  revalidatePath("/admin");
  revalidatePath("/admin/users");
}

export async function assignUserPositionAction(formData: FormData) {
  const userId = String(formData.get("userId") ?? "").trim();
  const positionId = String(formData.get("positionId") ?? "").trim();

  if (!userId || !positionId) {
    return;
  }

  await assignPositionToUser({
    userId,
    positionId,
    type: String(formData.get("type") ?? "").trim() || undefined,
    assignedAt: String(formData.get("assignedAt") ?? "").trim() || undefined,
    notes: String(formData.get("notes") ?? "").trim() || undefined,
  });

  revalidatePath("/admin");
  revalidatePath("/admin/users");
}

export async function vacateUserPositionAction(formData: FormData) {
  const userId = String(formData.get("userId") ?? "").trim();
  const positionId = String(formData.get("positionId") ?? "").trim();

  if (!userId || !positionId) {
    return;
  }

  await vacateUserPosition(userId, positionId);
  revalidatePath("/admin");
  revalidatePath("/admin/users");
}
