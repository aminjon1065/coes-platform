import { authorizedBackendJson } from "./auth";

export type PortalFileRecord = {
  id: string;
  displayName: string;
  originalFilename: string;
  mimeType: string | null;
  folderId: string | null;
  classification: number;
  ownerPositionId: string;
  uploadedById: string;
  currentVersionId: string | null;
  totalSizeBytes: number;
  versionCount: number;
  scanStatus: string;
  scannedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type PortalFileFolder = {
  id: string;
  name: string;
  parentId: string | null;
  ownerPositionId: string;
  classification: number;
  description: string | null;
  createdAt: string;
  updatedAt: string;
};

export type PortalFileVersion = {
  id: string;
  versionNumber: number;
  sizeBytes: number;
  sha256Hash: string;
  uploadedById: string;
  uploadNote: string | null;
  createdAt: string;
};

export type PortalFilePermission = {
  id: string;
  granteePositionId: string;
  action: string;
  effect: string;
  expiresAt: string | null;
  revokedAt: string | null;
  createdAt: string;
};

export type PortalFileLink = {
  id: string;
  fileId: string;
  linkedEntityId: string;
  linkedEntityType: string;
  linkedById: string;
  linkedAt: string;
};

export type PortalFileListing = {
  total: number;
  files: PortalFileRecord[];
};

export type PortalFolderContents = {
  folders: PortalFileFolder[];
  files: PortalFileRecord[];
};

function normalizeFileRecord(input: Record<string, unknown>): PortalFileRecord {
  return {
    id: String(input.id),
    displayName: String(input.displayName ?? input.display_name ?? "Unnamed file"),
    originalFilename: String(
      input.originalFilename ?? input.original_filename ?? "unknown.bin",
    ),
    mimeType: typeof input.mimeType === "string" ? input.mimeType : null,
    folderId: typeof input.folderId === "string" ? input.folderId : null,
    classification: Number(input.classification ?? 0),
    ownerPositionId: String(input.ownerPositionId ?? ""),
    uploadedById: String(input.uploadedById ?? ""),
    currentVersionId:
      typeof input.currentVersionId === "string" ? input.currentVersionId : null,
    totalSizeBytes: Number(input.totalSizeBytes ?? 0),
    versionCount: Number(input.versionCount ?? 0),
    scanStatus: String(input.scanStatus ?? "pending"),
    scannedAt: typeof input.scannedAt === "string" ? input.scannedAt : null,
    createdAt: String(input.createdAt ?? ""),
    updatedAt: String(input.updatedAt ?? input.createdAt ?? ""),
  };
}

function normalizeFolder(input: Record<string, unknown>): PortalFileFolder {
  return {
    id: String(input.id),
    name: String(input.name ?? "Unnamed folder"),
    parentId: typeof input.parentId === "string" ? input.parentId : null,
    ownerPositionId: String(input.ownerPositionId ?? ""),
    classification: Number(input.classification ?? 0),
    description: typeof input.description === "string" ? input.description : null,
    createdAt: String(input.createdAt ?? ""),
    updatedAt: String(input.updatedAt ?? input.createdAt ?? ""),
  };
}

function normalizeVersion(input: Record<string, unknown>): PortalFileVersion {
  return {
    id: String(input.id),
    versionNumber: Number(input.versionNumber ?? 0),
    sizeBytes: Number(input.sizeBytes ?? 0),
    sha256Hash: String(input.sha256Hash ?? ""),
    uploadedById: String(input.uploadedById ?? ""),
    uploadNote: typeof input.uploadNote === "string" ? input.uploadNote : null,
    createdAt: String(input.createdAt ?? ""),
  };
}

function normalizePermission(input: Record<string, unknown>): PortalFilePermission {
  return {
    id: String(input.id),
    granteePositionId: String(input.granteePositionId ?? ""),
    action: String(input.action ?? "read"),
    effect: String(input.effect ?? "allow"),
    expiresAt: typeof input.expiresAt === "string" ? input.expiresAt : null,
    revokedAt: typeof input.revokedAt === "string" ? input.revokedAt : null,
    createdAt: String(input.createdAt ?? ""),
  };
}

function normalizeLink(input: Record<string, unknown>): PortalFileLink {
  return {
    id: String(input.id),
    fileId: String(input.fileId ?? ""),
    linkedEntityId: String(input.linkedEntityId ?? ""),
    linkedEntityType: String(input.linkedEntityType ?? "document"),
    linkedById: String(input.linkedById ?? ""),
    linkedAt: String(input.linkedAt ?? ""),
  };
}

export async function listFiles(input?: {
  folderId?: string;
  search?: string;
  scanStatus?: string;
  limit?: number;
  offset?: number;
}) {
  const params = new URLSearchParams();
  if (input?.folderId) params.set("folderId", input.folderId);
  if (input?.search) params.set("search", input.search);
  if (input?.scanStatus) params.set("scanStatus", input.scanStatus);
  params.set("limit", String(input?.limit ?? 50));
  params.set("offset", String(input?.offset ?? 0));

  const response = await authorizedBackendJson<{
    data: Record<string, unknown>[];
    total: number;
  }>(`/files?${params.toString()}`);

  return {
    total: response.total,
    files: response.data.map(normalizeFileRecord),
  } satisfies PortalFileListing;
}

export async function getFolderContents(folderId?: string) {
  const params = new URLSearchParams();
  if (folderId) {
    params.set("folderId", folderId);
  }

  const response = await authorizedBackendJson<{
    folders: Record<string, unknown>[];
    files: Record<string, unknown>[];
  }>(`/files/folders/tree${params.toString() ? `?${params.toString()}` : ""}`);

  return {
    folders: response.folders.map(normalizeFolder),
    files: response.files.map(normalizeFileRecord),
  } satisfies PortalFolderContents;
}

export async function createFolder(input: {
  name: string;
  parentId?: string;
  classification: number;
  description?: string;
}) {
  const response = await authorizedBackendJson<Record<string, unknown>>("/files/folders", {
    method: "POST",
    body: JSON.stringify({
      name: input.name,
      parentId: input.parentId || undefined,
      classification: input.classification,
      description: input.description || undefined,
    }),
  });

  return normalizeFolder(response);
}

export async function deleteFolder(folderId: string) {
  await authorizedBackendJson<void>(`/files/folders/${folderId}`, {
    method: "DELETE",
  });
}

export async function getFileDetail(fileId: string) {
  const [file, versions, permissions] = await Promise.all([
    authorizedBackendJson<Record<string, unknown>>(`/files/${fileId}`),
    authorizedBackendJson<Record<string, unknown>[]>(`/files/${fileId}/versions`),
    authorizedBackendJson<Record<string, unknown>[]>(`/files/${fileId}/permissions`),
  ]);

  return {
    file: normalizeFileRecord(file),
    versions: versions.map(normalizeVersion),
    permissions: permissions.map(normalizePermission),
  };
}

export async function getDownloadUrl(fileId: string, expirySeconds = 3600) {
  return authorizedBackendJson<{ url: string; expiresInSeconds: number }>(
    `/files/${fileId}/download-url?expirySeconds=${expirySeconds}`,
  );
}

export async function deleteFile(fileId: string) {
  await authorizedBackendJson<void>(`/files/${fileId}`, {
    method: "DELETE",
  });
}

export async function grantFilePermission(input: {
  fileId: string;
  granteePositionId: string;
  action: string;
  effect?: string;
  expiresAt?: string;
}) {
  const response = await authorizedBackendJson<Record<string, unknown>>(
    `/files/${input.fileId}/permissions`,
    {
      method: "POST",
      body: JSON.stringify({
        granteePositionId: input.granteePositionId,
        action: input.action,
        effect: input.effect ?? "allow",
        expiresAt: input.expiresAt || undefined,
      }),
    },
  );

  return normalizePermission(response);
}

export async function revokeFilePermission(fileId: string, permissionId: string) {
  await authorizedBackendJson<void>(`/files/${fileId}/permissions/${permissionId}`, {
    method: "DELETE",
  });
}

export async function getEntityLinks(entityType: string, entityId: string) {
  const response = await authorizedBackendJson<Record<string, unknown>[]>(
    `/files/links/${entityType}/${entityId}`,
  );

  return response.map(normalizeLink);
}

export async function linkFileToEntity(input: {
  fileId: string;
  linkedEntityId: string;
  linkedEntityType: string;
}) {
  const response = await authorizedBackendJson<Record<string, unknown>>(
    `/files/${input.fileId}/links`,
    {
      method: "POST",
      body: JSON.stringify({
        linkedEntityId: input.linkedEntityId,
        linkedEntityType: input.linkedEntityType,
      }),
    },
  );

  return normalizeLink(response);
}

export async function unlinkFileFromEntity(input: {
  fileId: string;
  linkedEntityId: string;
  linkedEntityType: string;
}) {
  await authorizedBackendJson<void>(
    `/files/${input.fileId}/links/${input.linkedEntityType}/${input.linkedEntityId}`,
    {
      method: "DELETE",
    },
  );
}
