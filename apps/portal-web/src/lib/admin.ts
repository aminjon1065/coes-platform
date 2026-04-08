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

export type PortalAdminRegistryUser = PortalAdminUser & {
  roleAssignments: PortalUserRoleAssignment[];
  positionAssignments: Array<{
    id: string;
    positionId: string;
    positionTitle: string | null;
    departmentId: string | null;
    departmentName: string | null;
    type: string;
    assignedAt: string;
    vacatedAt: string | null;
    notes: string | null;
  }>;
};

export type PortalDepartmentNode = {
  id: string;
  name: string;
  code: string;
  isActive: boolean;
  parentDepartmentId: string | null;
  children: PortalDepartmentNode[];
};

export type PortalDepartmentSummaryNode = PortalDepartmentNode & {
  metrics: {
    positionCount: number;
    occupiedCount: number;
    vacantCount: number;
    userCount: number;
  };
  children: PortalDepartmentSummaryNode[];
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

export type PortalPositionOccupant = {
  id: string;
  credentialId: string;
  displayName: string;
  email: string;
  status: string;
} | null;

export type PortalPositionAdminRegistryItem = PortalPosition & {
  occupant: PortalPositionOccupant;
  commandChain: PortalPosition[];
  history: PortalUserPositionAssignment[];
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

export type PortalUserRoleAssignment = {
  id: string;
  userId: string;
  roleId: string;
  roleName: string;
  departmentScopeId: string | null;
  positionId: string | null;
  grantedById: string | null;
  expiresAt: string | null;
  revokedAt: string | null;
  createdAt: string;
};

export type PortalSystemHealth = {
  status: string;
  service: string;
  timestamp: string;
  uptimeSeconds: number;
};

export type PortalCallsOperationsSummary = {
  kpis: {
    activeSessions: number;
    totalSessions: number;
    joinedParticipants: number;
    upcomingSchedules: number;
  };
  recordings: {
    recording: number;
    processing: number;
    ready: number;
    failed: number;
    deleted: number;
    expiringSoon: number;
  };
  media: {
    reachable: boolean;
    status: string;
    service: string | null;
    ts: number | null;
    activeSessions: number | null;
    error?: string;
    raw?: Record<string, unknown>;
  };
  retention: {
    ranAt: string | null;
    deletedCount: number;
    error: string | null;
  };
};

export type PortalOutboxOperationsSummary = {
  counts: {
    pending: number;
    dispatched: number;
    failed: number;
    deadLetter: number;
  };
  retryableCount: number;
  oldestPendingAt: string | null;
  nextRetryAt: string | null;
  latestFailure: {
    id: string;
    eventType: string;
    source: string | null;
    lastError: string | null;
    updatedAt: string;
  } | null;
};

export type PortalInboxOperationsSummary = {
  counts: {
    processing: number;
    completed: number;
    failed: number;
  };
  consumerCount: number;
  latestFailure: {
    id: string;
    consumer: string;
    eventType: string;
    lastError: string | null;
    updatedAt: string;
  } | null;
  staleProcessingCount: number;
};

export type PortalAdminOperationsSnapshot = {
  backend: PortalSystemHealth;
  gateway: {
    configured: boolean;
    wsUrl: string;
    eventBusConfigured: boolean;
  };
  search: Record<string, unknown>;
  calls: PortalCallsOperationsSummary;
  reliability: {
    outbox: PortalOutboxOperationsSummary;
    inbox: PortalInboxOperationsSummary;
    outboxBacklog: Array<{
      id: string;
      eventType: string;
      source: string | null;
      status: string;
      attempts: number;
      maxAttempts: number;
      availableAt: string;
      lastError: string | null;
      updatedAt: string;
    }>;
    inboxBacklog: Array<{
      id: string;
      consumer: string;
      eventType: string;
      status: string;
      attempts: number;
      lastError: string | null;
      updatedAt: string;
    }>;
  };
  jobs: {
    analytics: Record<string, unknown>;
    reporting: Record<string, unknown>;
    audit: Record<string, unknown>;
  };
};

export type PortalAdminAlert = {
  id: string;
  severity: "critical" | "warning" | "info";
  title: string;
  detail: string;
  href: string;
};

export type PortalUserPositionAssignment = {
  id: string;
  userId: string;
  positionId: string;
  type: string;
  assignedAt: string;
  vacatedAt: string | null;
  assignedById: string | null;
  vacatedById: string | null;
  notes: string | null;
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

export type PortalAdminDashboardSummary = {
  kpis: {
    users: number;
    departments: number;
    positions: number;
    roles: number;
  };
  search: SearchHealth;
  recentAudit: PortalAuditEvent[];
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

export async function getAdminDashboardSummary(auditLimit = 5) {
  const response = await authorizedBackendJson<{
    kpis: {
      users: number;
      departments: number;
      positions: number;
      roles: number;
    };
    search: Record<string, unknown>;
    recentAudit: Array<Record<string, unknown>>;
  }>(`/authorization/admin/summary?auditLimit=${auditLimit}`);

  return {
    kpis: response.kpis,
    search: {
      ready:
        response.search.status === "healthy" ||
        Boolean(response.search.ready ?? false) ||
        (Boolean(response.search.available) &&
          Array.isArray(response.search.indices) &&
          response.search.indices.every((index) => Boolean((index as { exists?: boolean }).exists))),
      details: response.search,
    },
    recentAudit: response.recentAudit.map((event) => ({
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
    })),
  } satisfies PortalAdminDashboardSummary;
}

export async function getAdminUserRegistry(search?: string) {
  const searchParams = new URLSearchParams();
  searchParams.set("limit", "100");
  if (search?.trim()) {
    searchParams.set("search", search.trim());
  }

  const response = await authorizedBackendJson<{
    items: Array<Record<string, unknown>>;
    total: number;
  }>(`/users/admin/registry?${searchParams.toString()}`);

  return {
    total: response.total,
    items: response.items.map((user) => ({
      ...normalizeUser(user),
      roleAssignments: Array.isArray(user.roleAssignments)
        ? user.roleAssignments.map((assignment) => ({
            id: String((assignment as Record<string, unknown>).id),
            userId: String((assignment as Record<string, unknown>).userId ?? ""),
            roleId: String((assignment as Record<string, unknown>).roleId),
            roleName: String((assignment as Record<string, unknown>).roleName ?? "Unknown role"),
            departmentScopeId:
              typeof (assignment as Record<string, unknown>).departmentScopeId === "string"
                ? String((assignment as Record<string, unknown>).departmentScopeId)
                : null,
            positionId:
              typeof (assignment as Record<string, unknown>).positionId === "string"
                ? String((assignment as Record<string, unknown>).positionId)
                : null,
            grantedById: null,
            expiresAt:
              typeof (assignment as Record<string, unknown>).expiresAt === "string"
                ? String((assignment as Record<string, unknown>).expiresAt)
                : null,
            revokedAt: null,
            createdAt: "",
          }))
        : [],
      positionAssignments: Array.isArray(user.positionAssignments)
        ? user.positionAssignments.map((assignment) => ({
            id: String((assignment as Record<string, unknown>).id),
            positionId: String((assignment as Record<string, unknown>).positionId),
            positionTitle:
              typeof (assignment as Record<string, unknown>).positionTitle === "string"
                ? String((assignment as Record<string, unknown>).positionTitle)
                : null,
            departmentId:
              typeof (assignment as Record<string, unknown>).departmentId === "string"
                ? String((assignment as Record<string, unknown>).departmentId)
                : null,
            departmentName:
              typeof (assignment as Record<string, unknown>).departmentName === "string"
                ? String((assignment as Record<string, unknown>).departmentName)
                : null,
            type: String((assignment as Record<string, unknown>).type ?? "primary"),
            assignedAt: String((assignment as Record<string, unknown>).assignedAt ?? ""),
            vacatedAt:
              typeof (assignment as Record<string, unknown>).vacatedAt === "string"
                ? String((assignment as Record<string, unknown>).vacatedAt)
                : null,
            notes:
              typeof (assignment as Record<string, unknown>).notes === "string"
                ? String((assignment as Record<string, unknown>).notes)
                : null,
          }))
        : [],
    })) satisfies PortalAdminRegistryUser[],
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

export async function listUserPositionAssignments(userId: string) {
  const assignments = await authorizedBackendJson<Array<Record<string, unknown>>>(
    `/users/${userId}/positions`,
  );

  return assignments.map((assignment) => ({
    id: String(assignment.id),
    userId: String(assignment.userId),
    positionId: String(assignment.positionId),
    type: String(assignment.type ?? "primary"),
    assignedAt: String(assignment.assignedAt ?? ""),
    vacatedAt: typeof assignment.vacatedAt === "string" ? assignment.vacatedAt : null,
    assignedById: typeof assignment.assignedById === "string" ? assignment.assignedById : null,
    vacatedById: typeof assignment.vacatedById === "string" ? assignment.vacatedById : null,
    notes: typeof assignment.notes === "string" ? assignment.notes : null,
  })) satisfies PortalUserPositionAssignment[];
}

export async function assignPositionToUser(input: {
  userId: string;
  positionId: string;
  type?: string;
  assignedAt?: string;
  notes?: string;
}) {
  return authorizedBackendJson<PortalUserPositionAssignment>(`/users/${input.userId}/positions`, {
    method: "POST",
    body: JSON.stringify({
      positionId: input.positionId,
      type: input.type || undefined,
      assignedAt: input.assignedAt || undefined,
      notes: input.notes || undefined,
    }),
  });
}

export async function vacateUserPosition(userId: string, positionId: string) {
  await authorizedBackendJson<void>(`/users/${userId}/positions/${positionId}`, {
    method: "DELETE",
  });
}

export async function listUserRoleAssignments(credentialId: string) {
  const assignments = await authorizedBackendJson<Array<Record<string, unknown>>>(
    `/authorization/users/${credentialId}/roles`,
  );

  return assignments.map((assignment) => ({
    id: String(assignment.id),
    userId: String(assignment.userId),
    roleId: String(assignment.roleId),
    roleName: String(assignment.roleName ?? "Unknown role"),
    departmentScopeId:
      typeof assignment.departmentScopeId === "string" ? assignment.departmentScopeId : null,
    positionId: typeof assignment.positionId === "string" ? assignment.positionId : null,
    grantedById: typeof assignment.grantedById === "string" ? assignment.grantedById : null,
    expiresAt: typeof assignment.expiresAt === "string" ? assignment.expiresAt : null,
    revokedAt: typeof assignment.revokedAt === "string" ? assignment.revokedAt : null,
    createdAt: String(assignment.createdAt ?? ""),
  })) satisfies PortalUserRoleAssignment[];
}

export async function assignRoleToUser(input: {
  credentialId: string;
  roleId: string;
  departmentScopeId?: string;
  positionId?: string;
  expiresAt?: string;
}) {
  return authorizedBackendJson<PortalUserRoleAssignment>(
    `/authorization/users/${input.credentialId}/roles`,
    {
      method: "POST",
      body: JSON.stringify({
        roleId: input.roleId,
        departmentScopeId: input.departmentScopeId || undefined,
        positionId: input.positionId || undefined,
        expiresAt: input.expiresAt || undefined,
      }),
    },
  );
}

export async function revokeUserRoleAssignment(credentialId: string, assignmentId: string) {
  await authorizedBackendJson<void>(
    `/authorization/users/${credentialId}/roles/${assignmentId}`,
    {
      method: "DELETE",
    },
  );
}

export async function getDepartmentTree() {
  const tree = await authorizedBackendJson<Record<string, unknown>[]>(
    "/org/departments/tree",
  );
  return tree.map(normalizeDepartment);
}

function normalizeDepartmentSummary(node: Record<string, unknown>): PortalDepartmentSummaryNode {
  const metrics = node.metrics as Record<string, unknown> | undefined;
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
    metrics: {
      positionCount: Number(metrics?.positionCount ?? 0),
      occupiedCount: Number(metrics?.occupiedCount ?? 0),
      vacantCount: Number(metrics?.vacantCount ?? 0),
      userCount: Number(metrics?.userCount ?? 0),
    },
    children: Array.isArray(node.children)
      ? node.children.map((child) => normalizeDepartmentSummary(child as Record<string, unknown>))
      : [],
  };
}

export async function getDepartmentAdminSummary() {
  const response = await authorizedBackendJson<{
    items: Array<Record<string, unknown>>;
  }>("/org/departments/admin/summary");

  return response.items.map(normalizeDepartmentSummary);
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

export async function getPositionAdminRegistry() {
  const response = await authorizedBackendJson<{
    items: Array<Record<string, unknown>>;
  }>('/org/positions/admin/registry');

  return response.items.map((item) => ({
    ...normalizePosition(item),
    occupant:
      item.occupant && typeof item.occupant === 'object'
        ? {
            id: String((item.occupant as Record<string, unknown>).id),
            credentialId: String((item.occupant as Record<string, unknown>).credentialId ?? ''),
            displayName: String((item.occupant as Record<string, unknown>).displayName ?? ''),
            email: String((item.occupant as Record<string, unknown>).email ?? ''),
            status: String((item.occupant as Record<string, unknown>).status ?? 'unknown'),
          }
        : null,
    commandChain: Array.isArray(item.commandChain)
      ? item.commandChain.map((position) => normalizePosition(position as Record<string, unknown>))
      : [],
    history: Array.isArray(item.history)
      ? item.history.map((assignment) => ({
          id: String((assignment as Record<string, unknown>).id),
          userId: String((assignment as Record<string, unknown>).userId),
          positionId: String((assignment as Record<string, unknown>).positionId),
          type: String((assignment as Record<string, unknown>).type ?? 'primary'),
          assignedAt: String((assignment as Record<string, unknown>).assignedAt ?? ''),
          vacatedAt:
            typeof (assignment as Record<string, unknown>).vacatedAt === 'string'
              ? String((assignment as Record<string, unknown>).vacatedAt)
              : null,
          assignedById:
            typeof (assignment as Record<string, unknown>).assignedById === 'string'
              ? String((assignment as Record<string, unknown>).assignedById)
              : null,
          vacatedById:
            typeof (assignment as Record<string, unknown>).vacatedById === 'string'
              ? String((assignment as Record<string, unknown>).vacatedById)
              : null,
          notes:
            typeof (assignment as Record<string, unknown>).notes === 'string'
              ? String((assignment as Record<string, unknown>).notes)
              : null,
        }))
      : [],
  })) satisfies PortalPositionAdminRegistryItem[];
}

export async function getPositionCommandChain(positionId: string) {
  const chain = await authorizedBackendJson<Array<Record<string, unknown>>>(
    `/org/positions/${positionId}/command-chain`,
  );
  return chain.map(normalizePosition);
}

export async function getPositionOccupant(positionId: string): Promise<PortalPositionOccupant> {
  const occupant = await authorizedBackendJson<Record<string, unknown> | null>(
    `/org/positions/${positionId}/occupant`,
  );

  if (!occupant) {
    return null;
  }

  return {
    id: String(occupant.id),
    credentialId: String(occupant.credentialId ?? ""),
    displayName:
      typeof occupant.displayName === "string" && occupant.displayName.trim()
        ? occupant.displayName
        : [occupant.firstName, occupant.lastName].filter(Boolean).join(" ") || String(occupant.email ?? occupant.id),
    email: String(occupant.email ?? ""),
    status: String(occupant.status ?? "unknown"),
  };
}

export async function getPositionHistory(positionId: string) {
  const history = await authorizedBackendJson<Array<Record<string, unknown>>>(
    `/org/positions/${positionId}/history`,
  );

  return history.map((assignment) => ({
    id: String(assignment.id),
    userId: String(assignment.userId),
    positionId: String(assignment.positionId),
    type: String(assignment.type ?? "primary"),
    assignedAt: String(assignment.assignedAt ?? ""),
    vacatedAt: typeof assignment.vacatedAt === "string" ? assignment.vacatedAt : null,
    assignedById: typeof assignment.assignedById === "string" ? assignment.assignedById : null,
    vacatedById: typeof assignment.vacatedById === "string" ? assignment.vacatedById : null,
    notes: typeof assignment.notes === "string" ? assignment.notes : null,
  })) satisfies PortalUserPositionAssignment[];
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

export async function getCallsOperationsSummary() {
  const response = await authorizedBackendJson<Record<string, unknown>>('/calls/admin/operations');

  return {
    kpis: {
      activeSessions: Number((response.kpis as Record<string, unknown> | undefined)?.activeSessions ?? 0),
      totalSessions: Number((response.kpis as Record<string, unknown> | undefined)?.totalSessions ?? 0),
      joinedParticipants: Number((response.kpis as Record<string, unknown> | undefined)?.joinedParticipants ?? 0),
      upcomingSchedules: Number((response.kpis as Record<string, unknown> | undefined)?.upcomingSchedules ?? 0),
    },
    recordings: {
      recording: Number((response.recordings as Record<string, unknown> | undefined)?.recording ?? 0),
      processing: Number((response.recordings as Record<string, unknown> | undefined)?.processing ?? 0),
      ready: Number((response.recordings as Record<string, unknown> | undefined)?.ready ?? 0),
      failed: Number((response.recordings as Record<string, unknown> | undefined)?.failed ?? 0),
      deleted: Number((response.recordings as Record<string, unknown> | undefined)?.deleted ?? 0),
      expiringSoon: Number((response.recordings as Record<string, unknown> | undefined)?.expiringSoon ?? 0),
    },
    media: {
      reachable: Boolean((response.media as Record<string, unknown> | undefined)?.reachable),
      status: String((response.media as Record<string, unknown> | undefined)?.status ?? 'unknown'),
      service:
        typeof (response.media as Record<string, unknown> | undefined)?.service === 'string'
          ? String((response.media as Record<string, unknown>).service)
          : null,
      ts:
        typeof (response.media as Record<string, unknown> | undefined)?.ts === 'number'
          ? Number((response.media as Record<string, unknown>).ts)
          : null,
      activeSessions:
        typeof (response.media as Record<string, unknown> | undefined)?.activeSessions === 'number'
          ? Number((response.media as Record<string, unknown>).activeSessions)
          : null,
      error:
        typeof (response.media as Record<string, unknown> | undefined)?.error === 'string'
          ? String((response.media as Record<string, unknown>).error)
          : undefined,
      raw:
        (response.media as Record<string, unknown> | undefined)?.raw &&
        typeof (response.media as Record<string, unknown>).raw === 'object'
          ? ((response.media as Record<string, unknown>).raw as Record<string, unknown>)
          : undefined,
    },
    retention: {
      ranAt:
        typeof (response.retention as Record<string, unknown> | undefined)?.ranAt === 'string'
          ? String((response.retention as Record<string, unknown>).ranAt)
          : null,
      deletedCount: Number((response.retention as Record<string, unknown> | undefined)?.deletedCount ?? 0),
      error:
        typeof (response.retention as Record<string, unknown> | undefined)?.error === 'string'
          ? String((response.retention as Record<string, unknown>).error)
          : null,
    },
  } satisfies PortalCallsOperationsSummary;
}

export async function getAdminOperationsSnapshot() {
  const response = await authorizedBackendJson<Record<string, unknown>>('/authorization/admin/operations');

  return {
    backend: {
      status: String((response.backend as Record<string, unknown> | undefined)?.status ?? 'unknown'),
      service: String((response.backend as Record<string, unknown> | undefined)?.service ?? 'unknown'),
      timestamp: String((response.backend as Record<string, unknown> | undefined)?.timestamp ?? ''),
      uptimeSeconds: Number((response.backend as Record<string, unknown> | undefined)?.uptimeSeconds ?? 0),
    },
    gateway: {
      configured: Boolean((response.gateway as Record<string, unknown> | undefined)?.configured),
      wsUrl: String((response.gateway as Record<string, unknown> | undefined)?.wsUrl ?? ''),
      eventBusConfigured: Boolean((response.gateway as Record<string, unknown> | undefined)?.eventBusConfigured),
    },
    search:
      response.search && typeof response.search === 'object'
        ? (response.search as Record<string, unknown>)
        : {},
    calls: {
      kpis: {
        activeSessions: Number((((response.calls as Record<string, unknown> | undefined)?.kpis as Record<string, unknown> | undefined)?.activeSessions) ?? 0),
        totalSessions: Number((((response.calls as Record<string, unknown> | undefined)?.kpis as Record<string, unknown> | undefined)?.totalSessions) ?? 0),
        joinedParticipants: Number((((response.calls as Record<string, unknown> | undefined)?.kpis as Record<string, unknown> | undefined)?.joinedParticipants) ?? 0),
        upcomingSchedules: Number((((response.calls as Record<string, unknown> | undefined)?.kpis as Record<string, unknown> | undefined)?.upcomingSchedules) ?? 0),
      },
      recordings: {
        recording: Number((((response.calls as Record<string, unknown> | undefined)?.recordings as Record<string, unknown> | undefined)?.recording) ?? 0),
        processing: Number((((response.calls as Record<string, unknown> | undefined)?.recordings as Record<string, unknown> | undefined)?.processing) ?? 0),
        ready: Number((((response.calls as Record<string, unknown> | undefined)?.recordings as Record<string, unknown> | undefined)?.ready) ?? 0),
        failed: Number((((response.calls as Record<string, unknown> | undefined)?.recordings as Record<string, unknown> | undefined)?.failed) ?? 0),
        deleted: Number((((response.calls as Record<string, unknown> | undefined)?.recordings as Record<string, unknown> | undefined)?.deleted) ?? 0),
        expiringSoon: Number((((response.calls as Record<string, unknown> | undefined)?.recordings as Record<string, unknown> | undefined)?.expiringSoon) ?? 0),
      },
      media: {
        reachable: Boolean((((response.calls as Record<string, unknown> | undefined)?.media as Record<string, unknown> | undefined)?.reachable)),
        status: String((((response.calls as Record<string, unknown> | undefined)?.media as Record<string, unknown> | undefined)?.status) ?? 'unknown'),
        service:
          typeof (((response.calls as Record<string, unknown> | undefined)?.media as Record<string, unknown> | undefined)?.service) === 'string'
            ? String((((response.calls as Record<string, unknown>).media as Record<string, unknown>).service))
            : null,
        ts:
          typeof (((response.calls as Record<string, unknown> | undefined)?.media as Record<string, unknown> | undefined)?.ts) === 'number'
            ? Number((((response.calls as Record<string, unknown>).media as Record<string, unknown>).ts))
            : null,
        activeSessions:
          typeof (((response.calls as Record<string, unknown> | undefined)?.media as Record<string, unknown> | undefined)?.activeSessions) === 'number'
            ? Number((((response.calls as Record<string, unknown>).media as Record<string, unknown>).activeSessions))
            : null,
        error:
          typeof (((response.calls as Record<string, unknown> | undefined)?.media as Record<string, unknown> | undefined)?.error) === 'string'
            ? String((((response.calls as Record<string, unknown>).media as Record<string, unknown>).error))
            : undefined,
        raw:
          (((response.calls as Record<string, unknown> | undefined)?.media as Record<string, unknown> | undefined)?.raw &&
          typeof (((response.calls as Record<string, unknown>).media as Record<string, unknown>).raw) === 'object')
            ? ((((response.calls as Record<string, unknown>).media as Record<string, unknown>).raw) as Record<string, unknown>)
            : undefined,
      },
      retention: {
        ranAt:
          typeof (((response.calls as Record<string, unknown> | undefined)?.retention as Record<string, unknown> | undefined)?.ranAt) === 'string'
            ? String((((response.calls as Record<string, unknown>).retention as Record<string, unknown>).ranAt))
            : null,
        deletedCount: Number((((response.calls as Record<string, unknown> | undefined)?.retention as Record<string, unknown> | undefined)?.deletedCount) ?? 0),
        error:
          typeof (((response.calls as Record<string, unknown> | undefined)?.retention as Record<string, unknown> | undefined)?.error) === 'string'
            ? String((((response.calls as Record<string, unknown>).retention as Record<string, unknown>).error))
            : null,
      },
    },
    reliability: {
      outbox: {
        counts: {
          pending: Number((((response.reliability as Record<string, unknown> | undefined)?.outbox as Record<string, unknown> | undefined)?.counts as Record<string, unknown> | undefined)?.pending ?? 0),
          dispatched: Number((((response.reliability as Record<string, unknown> | undefined)?.outbox as Record<string, unknown> | undefined)?.counts as Record<string, unknown> | undefined)?.dispatched ?? 0),
          failed: Number((((response.reliability as Record<string, unknown> | undefined)?.outbox as Record<string, unknown> | undefined)?.counts as Record<string, unknown> | undefined)?.failed ?? 0),
          deadLetter: Number((((response.reliability as Record<string, unknown> | undefined)?.outbox as Record<string, unknown> | undefined)?.counts as Record<string, unknown> | undefined)?.deadLetter ?? 0),
        },
        retryableCount: Number((((response.reliability as Record<string, unknown> | undefined)?.outbox as Record<string, unknown> | undefined)?.retryableCount) ?? 0),
        oldestPendingAt:
          typeof (((response.reliability as Record<string, unknown> | undefined)?.outbox as Record<string, unknown> | undefined)?.oldestPendingAt) === 'string'
            ? String((((response.reliability as Record<string, unknown>).outbox as Record<string, unknown>).oldestPendingAt))
            : null,
        nextRetryAt:
          typeof (((response.reliability as Record<string, unknown> | undefined)?.outbox as Record<string, unknown> | undefined)?.nextRetryAt) === 'string'
            ? String((((response.reliability as Record<string, unknown>).outbox as Record<string, unknown>).nextRetryAt))
            : null,
        latestFailure:
          (((response.reliability as Record<string, unknown> | undefined)?.outbox as Record<string, unknown> | undefined)?.latestFailure &&
          typeof (((response.reliability as Record<string, unknown>).outbox as Record<string, unknown>).latestFailure) === 'object')
            ? {
                eventType: String(((((response.reliability as Record<string, unknown>).outbox as Record<string, unknown>).latestFailure as Record<string, unknown>).eventType) ?? 'unknown'),
                id: String(((((response.reliability as Record<string, unknown>).outbox as Record<string, unknown>).latestFailure as Record<string, unknown>).id) ?? ''),
                source:
                  typeof ((((response.reliability as Record<string, unknown>).outbox as Record<string, unknown>).latestFailure as Record<string, unknown>).source) === 'string'
                    ? String(((((response.reliability as Record<string, unknown>).outbox as Record<string, unknown>).latestFailure as Record<string, unknown>).source))
                    : null,
                lastError:
                  typeof ((((response.reliability as Record<string, unknown>).outbox as Record<string, unknown>).latestFailure as Record<string, unknown>).lastError) === 'string'
                    ? String(((((response.reliability as Record<string, unknown>).outbox as Record<string, unknown>).latestFailure as Record<string, unknown>).lastError))
                    : null,
                updatedAt: String(((((response.reliability as Record<string, unknown>).outbox as Record<string, unknown>).latestFailure as Record<string, unknown>).updatedAt) ?? ''),
              }
            : null,
      },
      inbox: {
        counts: {
          processing: Number((((response.reliability as Record<string, unknown> | undefined)?.inbox as Record<string, unknown> | undefined)?.counts as Record<string, unknown> | undefined)?.processing ?? 0),
          completed: Number((((response.reliability as Record<string, unknown> | undefined)?.inbox as Record<string, unknown> | undefined)?.counts as Record<string, unknown> | undefined)?.completed ?? 0),
          failed: Number((((response.reliability as Record<string, unknown> | undefined)?.inbox as Record<string, unknown> | undefined)?.counts as Record<string, unknown> | undefined)?.failed ?? 0),
        },
        consumerCount: Number((((response.reliability as Record<string, unknown> | undefined)?.inbox as Record<string, unknown> | undefined)?.consumerCount) ?? 0),
        staleProcessingCount: Number((((response.reliability as Record<string, unknown> | undefined)?.inbox as Record<string, unknown> | undefined)?.staleProcessingCount) ?? 0),
        latestFailure:
          (((response.reliability as Record<string, unknown> | undefined)?.inbox as Record<string, unknown> | undefined)?.latestFailure &&
          typeof (((response.reliability as Record<string, unknown>).inbox as Record<string, unknown>).latestFailure) === 'object')
            ? {
                consumer: String(((((response.reliability as Record<string, unknown>).inbox as Record<string, unknown>).latestFailure as Record<string, unknown>).consumer) ?? 'unknown'),
                id: String(((((response.reliability as Record<string, unknown>).inbox as Record<string, unknown>).latestFailure as Record<string, unknown>).id) ?? ''),
                eventType: String(((((response.reliability as Record<string, unknown>).inbox as Record<string, unknown>).latestFailure as Record<string, unknown>).eventType) ?? 'unknown'),
                lastError:
                  typeof ((((response.reliability as Record<string, unknown>).inbox as Record<string, unknown>).latestFailure as Record<string, unknown>).lastError) === 'string'
                    ? String(((((response.reliability as Record<string, unknown>).inbox as Record<string, unknown>).latestFailure as Record<string, unknown>).lastError))
                    : null,
                updatedAt: String(((((response.reliability as Record<string, unknown>).inbox as Record<string, unknown>).latestFailure as Record<string, unknown>).updatedAt) ?? ''),
              }
            : null,
      },
      outboxBacklog:
        Array.isArray((response.reliability as Record<string, unknown> | undefined)?.outboxBacklog)
          ? (((response.reliability as Record<string, unknown>).outboxBacklog) as Array<Record<string, unknown>>).map((item) => ({
              id: String(item.id ?? ""),
              eventType: String(item.eventType ?? "unknown"),
              source: typeof item.source === "string" ? item.source : null,
              status: String(item.status ?? "unknown"),
              attempts: Number(item.attempts ?? 0),
              maxAttempts: Number(item.maxAttempts ?? 0),
              availableAt: String(item.availableAt ?? ""),
              lastError: typeof item.lastError === "string" ? item.lastError : null,
              updatedAt: String(item.updatedAt ?? ""),
            }))
          : [],
      inboxBacklog:
        Array.isArray((response.reliability as Record<string, unknown> | undefined)?.inboxBacklog)
          ? (((response.reliability as Record<string, unknown>).inboxBacklog) as Array<Record<string, unknown>>).map((item) => ({
              id: String(item.id ?? ""),
              consumer: String(item.consumer ?? "unknown"),
              eventType: String(item.eventType ?? "unknown"),
              status: String(item.status ?? "unknown"),
              attempts: Number(item.attempts ?? 0),
              lastError: typeof item.lastError === "string" ? item.lastError : null,
              updatedAt: String(item.updatedAt ?? ""),
            }))
          : [],
    },
    jobs: {
      analytics:
        response.jobs && typeof response.jobs === 'object' && (response.jobs as Record<string, unknown>).analytics && typeof (response.jobs as Record<string, unknown>).analytics === 'object'
          ? ((response.jobs as Record<string, unknown>).analytics as Record<string, unknown>)
          : {},
      reporting:
        response.jobs && typeof response.jobs === 'object' && (response.jobs as Record<string, unknown>).reporting && typeof (response.jobs as Record<string, unknown>).reporting === 'object'
          ? ((response.jobs as Record<string, unknown>).reporting as Record<string, unknown>)
          : {},
      audit:
        response.jobs && typeof response.jobs === 'object' && (response.jobs as Record<string, unknown>).audit && typeof (response.jobs as Record<string, unknown>).audit === 'object'
          ? ((response.jobs as Record<string, unknown>).audit as Record<string, unknown>)
          : {},
    },
  } satisfies PortalAdminOperationsSnapshot;
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

export async function replayOutboxEvent(eventId: string) {
  await authorizedBackendJson(`/authorization/admin/operations/outbox/${eventId}/replay`, {
    method: "POST",
  });
}

export async function markOutboxDeadLetter(eventId: string) {
  await authorizedBackendJson(`/authorization/admin/operations/outbox/${eventId}/mark-dead-letter`, {
    method: "POST",
  });
}

export async function retryInboxMessage(messageId: string) {
  await authorizedBackendJson(`/authorization/admin/operations/inbox/${messageId}/retry`, {
    method: "POST",
  });
}

export async function resetInboxMessage(messageId: string) {
  await authorizedBackendJson(`/authorization/admin/operations/inbox/${messageId}/reset`, {
    method: "POST",
  });
}

export function flattenDepartments<T extends { children: T[] }>(
  tree: T[],
  depth = 0,
): Array<T & { depth: number }> {
  return tree.flatMap((node) => [
    { ...node, depth },
    ...flattenDepartments(node.children, depth + 1),
  ]);
}

export function collectDepartmentSubtreeIds(node: PortalDepartmentNode): string[] {
  return [
    node.id,
    ...node.children.flatMap((child) => collectDepartmentSubtreeIds(child)),
  ];
}

function isHealthyStatus(status: unknown) {
  if (typeof status !== "string") {
    return false;
  }

  return ["healthy", "ok", "ready", "up"].includes(status.toLowerCase());
}

function getJobError(summary: Record<string, unknown>) {
  return typeof summary.error === "string" && summary.error.trim()
    ? summary.error
    : null;
}

export function isSearchReady(search: Record<string, unknown>) {
  return (
    isHealthyStatus(search.status) ||
    Boolean(search.ready ?? false) ||
    (Boolean(search.available ?? false) &&
      Array.isArray(search.indices) &&
      search.indices.every((index) => Boolean((index as { exists?: boolean }).exists)))
  );
}

export function deriveAdminOperationsAlerts(
  snapshot: PortalAdminOperationsSnapshot,
): PortalAdminAlert[] {
  const alerts: PortalAdminAlert[] = [];

  if (!isHealthyStatus(snapshot.backend.status)) {
    alerts.push({
      id: "backend-status",
      severity: "critical",
      title: "Backend health degraded",
      detail: `Runtime status is ${snapshot.backend.status}.`,
      href: "/admin/system",
    });
  }

  if (!snapshot.gateway.configured) {
    alerts.push({
      id: "gateway-config",
      severity: "critical",
      title: "Realtime gateway is not configured",
      detail: "WebSocket gateway configuration is missing for portal realtime flows.",
      href: "/admin/system",
    });
  }

  if (!snapshot.gateway.eventBusConfigured) {
    alerts.push({
      id: "gateway-bus",
      severity: "warning",
      title: "Event bus is degraded",
      detail: "Gateway fan-out depends on event bus connectivity.",
      href: "/admin/system",
    });
  }

  if (!isSearchReady(snapshot.search)) {
    alerts.push({
      id: "search-health",
      severity: "warning",
      title: "Search health requires attention",
      detail: "Search is not reporting a ready or healthy state.",
      href: "/admin/system",
    });
  }

  if (!snapshot.calls.media.reachable) {
    alerts.push({
      id: "media-plane",
      severity: "critical",
      title: "Media plane is unreachable",
      detail: snapshot.calls.media.error ?? "Calls A/V transport is not reachable from backend monitoring.",
      href: "/admin/system",
    });
  }

  if (snapshot.calls.recordings.failed > 0) {
    alerts.push({
      id: "recordings-failed",
      severity: "warning",
      title: "Failed call recordings detected",
      detail: `${snapshot.calls.recordings.failed} recordings are in failed state.`,
      href: "/admin/system",
    });
  }

  if (snapshot.calls.recordings.expiringSoon > 0) {
    alerts.push({
      id: "recordings-expiring",
      severity: "info",
      title: "Recordings are approaching retention expiry",
      detail: `${snapshot.calls.recordings.expiringSoon} recording artifacts are expiring soon.`,
      href: "/admin/system",
    });
  }

  if (!snapshot.calls.retention.ranAt) {
    alerts.push({
      id: "retention-never-ran",
      severity: "warning",
      title: "Recording retention has not run yet",
      detail: "Retention cleanup has no recorded execution timestamp.",
      href: "/admin/system",
    });
  } else if (snapshot.calls.retention.error) {
    alerts.push({
      id: "retention-error",
      severity: "critical",
      title: "Recording retention failed",
      detail: snapshot.calls.retention.error,
      href: "/admin/system",
    });
  }

  if (snapshot.reliability.outbox.counts.deadLetter > 0) {
    alerts.push({
      id: "outbox-dead-letter",
      severity: "critical",
      title: "Outbox dead-letter events detected",
      detail: `${snapshot.reliability.outbox.counts.deadLetter} events exhausted retry attempts.`,
      href: "/admin/system",
    });
  }

  if (snapshot.reliability.outbox.counts.failed > 0) {
    alerts.push({
      id: "outbox-failed",
      severity: "warning",
      title: "Outbox has failed dispatches",
      detail: `${snapshot.reliability.outbox.counts.failed} events are waiting for retry.`,
      href: "/admin/system",
    });
  }

  if (snapshot.reliability.inbox.counts.failed > 0) {
    alerts.push({
      id: "inbox-failed",
      severity: "warning",
      title: "Inbox handlers failed",
      detail: `${snapshot.reliability.inbox.counts.failed} consumer messages are in failed state.`,
      href: "/admin/system",
    });
  }

  if (snapshot.reliability.inbox.staleProcessingCount > 0) {
    alerts.push({
      id: "inbox-stale-processing",
      severity: "warning",
      title: "Inbox has stale processing messages",
      detail: `${snapshot.reliability.inbox.staleProcessingCount} messages have been stuck in processing for over 5 minutes.`,
      href: "/admin/system",
    });
  }

  for (const [jobName, summary] of Object.entries(snapshot.jobs)) {
    const error = getJobError(summary);
    if (!error) {
      continue;
    }

    alerts.push({
      id: `job-${jobName}`,
      severity: "warning",
      title: `${jobName} job reported an error`,
      detail: error,
      href: "/admin/system",
    });
  }

  return alerts;
}
