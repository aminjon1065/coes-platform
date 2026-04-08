import { authorizedBackendJson } from "@/lib/auth";

export type PortalWorkspaceKey = "core" | "analytics" | "admin";

export type PortalWorkspace = {
  key: PortalWorkspaceKey;
  label: string;
  description: string;
};

export type PortalRoleAssignment = {
  id: string;
  roleId: string;
  roleName: string;
  departmentScopeId: string | null;
  positionId: string | null;
  expiresAt: string | null;
};

export type PortalContext = {
  roles: PortalRoleAssignment[];
  capabilities: string[];
  workspaces: PortalWorkspace[];
};

export type PortalNavItem = {
  href: string;
  label: string;
  workspace: PortalWorkspaceKey;
};

const BASELINE_NAV: PortalNavItem[] = [
  { href: "/dashboard", label: "Dashboard", workspace: "core" },
  { href: "/tasks", label: "Tasks", workspace: "core" },
  { href: "/edms", label: "EDMS", workspace: "core" },
  { href: "/files", label: "Files", workspace: "core" },
  { href: "/notifications", label: "Notifications", workspace: "core" },
  { href: "/chat", label: "Chat", workspace: "core" },
];

const OPTIONAL_NAV: PortalNavItem[] = [
  { href: "/gis", label: "GIS", workspace: "analytics" },
  { href: "/analytics", label: "Analytics", workspace: "analytics" },
  { href: "/search", label: "Search", workspace: "analytics" },
  { href: "/admin", label: "Admin", workspace: "admin" },
];

export async function getPortalContext(): Promise<PortalContext> {
  return authorizedBackendJson<PortalContext>("/authorization/me/portal-context");
}

export function hasWorkspace(context: PortalContext, workspace: PortalWorkspaceKey) {
  return context.workspaces.some((item) => item.key === workspace);
}

export function getPortalNavItems(context: PortalContext) {
  const enabledWorkspaces = new Set(context.workspaces.map((workspace) => workspace.key));
  return [...BASELINE_NAV, ...OPTIONAL_NAV].filter((item) => enabledWorkspaces.has(item.workspace));
}
