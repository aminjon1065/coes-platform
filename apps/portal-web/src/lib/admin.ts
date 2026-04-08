import { authorizedBackendJson, getBackendBaseUrl } from "./auth";

export type PortalAdminUser = {
  id: string;
  credentialId: string;
  displayName: string;
  email: string;
  phone: string | null;
  clearanceLevel: number;
  status: string;
};

export type PortalDepartmentNode = {
  id: string;
  name: string;
  code: string;
  isActive: boolean;
  parentDepartmentId: string | null;
  children: PortalDepartmentNode[];
};

export type PortalPosition = {
  id: string;
  title: string;
  level: string;
  departmentId: string;
  departmentName: string | null;
  reportsToId: string | null;
  isActive: boolean;
  canAssignTasks: boolean;
  canApproveDocuments: boolean;
  canIssueResolutions: boolean;
};

export type PortalRole = {
  id: string;
  name: string;
  description: string | null;
  parentRoleId: string | null;
  isSystemRole: boolean;
  permissions: string[];
  createdAt: string;
  updatedAt: string;
};

export type SearchHealth = {
  ready: boolean;
  details: Record<string, unknown>;
};

export type PortalSystemHealth = {
  status: string;
  service: string;
  timestamp: string;
  uptimeSeconds: number;
};

export type PortalAuditEvent = {
  id: string;
  actorId: string | null;
  actorUsername: string | null;
  eventType: string;
  resourceType: string | null;
  resourceId: string | null;
  success: boolean;
  failureReason: string | null;
  severity: string;
  occurredAt: string;
  metadata: Record<string, unknown> | null;
};

export type PortalAuditQuery = {
  actorId?: string;
  eventType?: string;
  resourceType?: string;
  severity?: string;
  domains?: string[];
  from?: string;
  to?: string;
  limit?: number;
  offset?: number;
};

export type PortalSearchReindexResult = {
  startedAt: string;
  finishedAt: string;
  batchSize: number;
  indices: string[];
  summary: Record<
    string,
    {
      scanned: number;
      indexed: number;
      skipped: number;
    }
  >;
  health: Record<string, unknown>;
};

function normalizeDepartment(node: Record<string, unknown>): PortalDepartmentNode {
  return {
    id: String(node.id),
    name: String(node.name ?? "Unnamed department"),
    code: String(node.code ?? node.shortCode ?? "N/A"),
    isActive: Boolean(node.isActive ?? node.active ?? true),
    parentDepartmentId:
      typeof node.parentDepartmentId === "string"
        ? node.parentDepartmentId
        : typeof node.parentId === "string"
          ? node.parentId
          : null,
    children: Array.isArray(node.children)
      ? node.children.map((child) => normalizeDepartment(child as Record<string, unknown>))
      : [],
  };
}

function normalizePosition(position: Record<string, unknown>): PortalPosition {
  const department = position.department as Record<string, unknown> | undefined;

  return {
    id: String(position.id),
    title: String(position.title ?? "Untitled position"),
    level: String(position.level ?? "unknown"),
    departmentId: String(position.departmentId ?? department?.id ?? ""),
    departmentName:
      typeof department?.name === "string" ? department.name : null,
    reportsToId: typeof position.reportsToId === "string" ? position.reportsToId : null,
    isActive: Boolean(position.isActive ?? position.active ?? true),
    canAssignTasks: Boolean(position.canAssignTasks),
    canApproveDocuments: Boolean(position.canApproveDocuments),
    canIssueResolutions: Boolean(position.canIssueResolutions),
  };
}

function normalizeUser(user: Record<string, unknown>): PortalAdminUser {
  return {
    id: String(user.id),
    credentialId: String(user.credentialId ?? ""),
    displayName:
      typeof user.displayName === "string" && user.displayName.trim()
        ? user.displayName
        : [user.firstName, user.lastName].filter(Boolean).join(" ") || String(user.email ?? user.id),
    email: String(user.email ?? ""),
    phone: typeof user.phone === "string" ? user.phone : null,
    clearanceLevel: Number(user.clearanceLevel ?? 0),
    status: String(user.status ?? "unknown"),
  };
}

export async function listAdminUsers(search?: string) {
  const searchParams = new URLSearchParams();
  searchParams.set("limit", "100");
  if (search?.trim()) {
    searchParams.set("search", search.trim());
  }

  const response = await authorizedBackendJson<{
    items: Record<string, unknown>[];
    total: number;
  }>(`/users?${searchParams.toString()}`);

  return {
    total: response.total,
    items: response.items.map(normalizeUser),
  };
}

export async function createAdminUser(input: {
  username: string;
  password: string;
  email: string;
  firstName: string;
  lastName: string;
  middleName?: string;
  displayName?: string;
  phone?: string;
  clearanceLevel: number;
}) {
  const credential = await authorizedBackendJson<{ id: string; email: string; username: string }>(
    "/auth/register",
    {
      method: "POST",
      body: JSON.stringify({
        username: input.username,
        password: input.password,
        email: input.email,
      }),
    },
  );

  const profile = await authorizedBackendJson<Record<string, unknown>>("/users", {
    method: "POST",
    body: JSON.stringify({
      credentialId: credential.id,
      email: input.email,
      firstName: input.firstName,
      lastName: input.lastName,
      middleName: input.middleName || undefined,
      displayName: input.displayName || undefined,
      phone: input.phone || undefined,
      clearanceLevel: input.clearanceLevel,
    }),
  });

  return normalizeUser(profile);
}

export async function offboardAdminUser(userId: string) {
  await authorizedBackendJson<void>(`/users/${userId}/offboard`, {
    method: "DELETE",
  });
}

export async function getDepartmentTree() {
  const tree = await authorizedBackendJson<Record<string, unknown>[]>(
    "/org/departments/tree",
  );
  return tree.map(normalizeDepartment);
}

export async function createDepartment(input: {
  name: string;
  code: string;
  parentDepartmentId?: string;
}) {
  const department = await authorizedBackendJson<Record<string, unknown>>("/org/departments", {
    method: "POST",
    body: JSON.stringify({
      name: input.name,
      code: input.code,
      parentDepartmentId: input.parentDepartmentId || undefined,
    }),
  });

  return normalizeDepartment({ ...department, children: [] });
}

export async function listPositions(departmentId?: string) {
  const searchParams = new URLSearchParams();
  if (departmentId?.trim()) {
    searchParams.set("departmentId", departmentId.trim());
  }

  const positions = await authorizedBackendJson<Record<string, unknown>[]>(
    `/org/positions${searchParams.toString() ? `?${searchParams.toString()}` : ""}`,
  );
  return positions.map(normalizePosition);
}

export async function createPosition(input: {
  title: string;
  level: string;
  departmentId: string;
  reportsToId?: string;
  canAssignTasks?: boolean;
  canApproveDocuments?: boolean;
  canIssueResolutions?: boolean;
}) {
  const position = await authorizedBackendJson<Record<string, unknown>>("/org/positions", {
    method: "POST",
    body: JSON.stringify({
      title: input.title,
      level: input.level,
      departmentId: input.departmentId,
      reportsToId: input.reportsToId || undefined,
      canAssignTasks: Boolean(input.canAssignTasks),
      canApproveDocuments: Boolean(input.canApproveDocuments),
      canIssueResolutions: Boolean(input.canIssueResolutions),
    }),
  });

  return normalizePosition(position);
}

export async function listRoles() {
  const roles = await authorizedBackendJson<Record<string, unknown>[]>(
    "/authorization/roles",
  );

  return roles.map((role) => ({
    id: String(role.id),
    name: String(role.name ?? "Unnamed role"),
    description: typeof role.description === "string" ? role.description : null,
    parentRoleId: typeof role.parentRoleId === "string" ? role.parentRoleId : null,
    isSystemRole: Boolean(role.isSystemRole),
    permissions: Array.isArray(role.permissions)
      ? role.permissions.map((permission) => String(permission)).sort((a, b) => a.localeCompare(b))
      : [],
    createdAt: String(role.createdAt ?? ""),
    updatedAt: String(role.updatedAt ?? ""),
  })) satisfies PortalRole[];
}

export async function listCapabilities() {
  const capabilities = await authorizedBackendJson<string[]>(
    "/authorization/roles/capabilities",
  );
  return capabilities.slice().sort((left, right) => left.localeCompare(right));
}

export async function createRole(input: {
  name: string;
  description?: string;
  permissionNames: string[];
  parentRoleId?: string;
}) {
  const role = await authorizedBackendJson<Record<string, unknown>>("/authorization/roles", {
    method: "POST",
    body: JSON.stringify({
      name: input.name,
      description: input.description || undefined,
      permissionNames: input.permissionNames,
      parentRoleId: input.parentRoleId || undefined,
    }),
  });

  return {
    id: String(role.id),
    name: String(role.name),
    description: typeof role.description === "string" ? role.description : null,
    parentRoleId: typeof role.parentRoleId === "string" ? role.parentRoleId : null,
    isSystemRole: Boolean(role.isSystemRole),
    permissions: Array.isArray(role.permissions)
      ? role.permissions.map((permission) => String(permission))
      : [],
    createdAt: String(role.createdAt ?? ""),
    updatedAt: String(role.updatedAt ?? ""),
  } satisfies PortalRole;
}

export async function deleteRole(roleId: string) {
  await authorizedBackendJson<void>(`/authorization/roles/${roleId}`, {
    method: "DELETE",
  });
}

export async function getSearchHealth() {
  const response = await authorizedBackendJson<Record<string, unknown>>("/search/admin/health");
  return {
    ready:
      response.status === "healthy" ||
      Boolean(response.ready ?? false) ||
      (Boolean(response.available) &&
        Array.isArray(response.indices) &&
        response.indices.every((index) => Boolean((index as { exists?: boolean }).exists))),
    details: response,
  } satisfies SearchHealth;
}

export async function getSystemHealth() {
  const baseUrl = getBackendBaseUrl().replace(/\/v\d+$/, "");
  const response = await fetch(`${baseUrl}/health`, {
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Health request failed: ${response.status}`);
  }

  const health = (await response.json()) as Record<string, unknown>;
  return {
    status: String(health.status ?? "unknown"),
    service: String(health.service ?? "unknown"),
    timestamp: String(health.timestamp ?? ""),
    uptimeSeconds: Number(health.uptimeSeconds ?? 0),
  } satisfies PortalSystemHealth;
}

export async function listAuditEvents(query: PortalAuditQuery = {}) {
  const searchParams = new URLSearchParams();

  if (query.actorId) searchParams.set("actorId", query.actorId);
  if (query.eventType) searchParams.set("eventType", query.eventType);
  if (query.resourceType) searchParams.set("resourceType", query.resourceType);
  if (query.severity) searchParams.set("severity", query.severity);
  if (query.from) searchParams.set("from", query.from);
  if (query.to) searchParams.set("to", query.to);
  if (query.domains?.length) searchParams.set("domains", query.domains.join(","));
  searchParams.set("limit", String(query.limit ?? 25));
  searchParams.set("offset", String(query.offset ?? 0));

  const response = await authorizedBackendJson<{
    data: Array<Record<string, unknown>>;
    total: number;
    limit: number;
    offset: number;
  }>(`/audit/events?${searchParams.toString()}`);

  return {
    total: response.total,
    limit: response.limit,
    offset: response.offset,
    items: response.data.map((event) => ({
      id: String(event.id),
      actorId: typeof event.actorId === "string" ? event.actorId : null,
      actorUsername: typeof event.actorUsername === "string" ? event.actorUsername : null,
      eventType: String(event.eventType ?? "unknown"),
      resourceType: typeof event.resourceType === "string" ? event.resourceType : null,
      resourceId: typeof event.resourceId === "string" ? event.resourceId : null,
      success: Boolean(event.success ?? true),
      failureReason: typeof event.failureReason === "string" ? event.failureReason : null,
      severity: String(event.severity ?? "info"),
      occurredAt: String(event.occurredAt ?? ""),
      metadata:
        event.metadata && typeof event.metadata === "object"
          ? (event.metadata as Record<string, unknown>)
          : null,
    })) satisfies PortalAuditEvent[],
  };
}

export async function triggerSearchReindex(input: {
  indices?: string[];
  batchSize?: number;
  ensureIndices?: boolean;
  refresh?: boolean;
}) {
  return authorizedBackendJson<PortalSearchReindexResult>("/search/admin/reindex", {
    method: "POST",
    body: JSON.stringify({
      indices: input.indices?.length ? input.indices : undefined,
      batchSize: input.batchSize,
      ensureIndices: input.ensureIndices,
      refresh: input.refresh,
    }),
  });
}

export function flattenDepartments(tree: PortalDepartmentNode[], depth = 0): Array<PortalDepartmentNode & { depth: number }> {
  return tree.flatMap((node) => [
    { ...node, depth },
    ...flattenDepartments(node.children, depth + 1),
  ]);
}
