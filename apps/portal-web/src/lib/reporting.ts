import { authorizedBackendJson } from "@/lib/auth";

export type PortalReportDefinition = {
  id: string;
  name: string;
  description: string | null;
  reportType: string;
  defaultFormat: string;
  isScheduled: boolean;
  cronExpression: string | null;
  deliveryChannel: string;
  deliveryConfig: Record<string, unknown>;
  classification: number;
  ownerId: string;
  isActive: boolean;
  querySpec: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export type PortalReportExecution = {
  id: string;
  definitionId: string;
  status: string;
  parameters: Record<string, unknown>;
  format: string;
  artifactKey: string | null;
  downloadUrl: string | null;
  inlineResult: Record<string, unknown> | null;
  rowCount: number | null;
  fileSizeBytes: number | null;
  startedAt: string | null;
  completedAt: string | null;
  durationMs: number | null;
  errorMessage: string | null;
  triggeredById: string | null;
  triggerSource: string;
  deliveryChannel: string;
  deliveredAt: string | null;
  createdAt: string;
  updatedAt: string;
};

function numberOrNull(value: unknown) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function normalizeDefinition(item: Record<string, unknown>): PortalReportDefinition {
  return {
    id: String(item.id),
    name: String(item.name ?? "Untitled report"),
    description: typeof item.description === "string" ? item.description : null,
    reportType: String(item.reportType ?? "custom"),
    defaultFormat: String(item.defaultFormat ?? "json"),
    isScheduled: Boolean(item.isScheduled),
    cronExpression: typeof item.cronExpression === "string" ? item.cronExpression : null,
    deliveryChannel: String(item.deliveryChannel ?? "download"),
    deliveryConfig:
      item.deliveryConfig && typeof item.deliveryConfig === "object"
        ? (item.deliveryConfig as Record<string, unknown>)
        : {},
    classification: Number(item.classification ?? 0),
    ownerId: String(item.ownerId ?? ""),
    isActive: Boolean(item.isActive ?? true),
    querySpec:
      item.querySpec && typeof item.querySpec === "object"
        ? (item.querySpec as Record<string, unknown>)
        : {},
    createdAt: String(item.createdAt ?? ""),
    updatedAt: String(item.updatedAt ?? ""),
  };
}

function normalizeExecution(item: Record<string, unknown>): PortalReportExecution {
  return {
    id: String(item.id),
    definitionId: String(item.definitionId ?? ""),
    status: String(item.status ?? "pending"),
    parameters:
      item.parameters && typeof item.parameters === "object"
        ? (item.parameters as Record<string, unknown>)
        : {},
    format: String(item.format ?? "json"),
    artifactKey: typeof item.artifactKey === "string" ? item.artifactKey : null,
    downloadUrl: typeof item.downloadUrl === "string" ? item.downloadUrl : null,
    inlineResult:
      item.inlineResult && typeof item.inlineResult === "object"
        ? (item.inlineResult as Record<string, unknown>)
        : null,
    rowCount: numberOrNull(item.rowCount),
    fileSizeBytes: numberOrNull(item.fileSizeBytes),
    startedAt: typeof item.startedAt === "string" ? item.startedAt : null,
    completedAt: typeof item.completedAt === "string" ? item.completedAt : null,
    durationMs: numberOrNull(item.durationMs),
    errorMessage: typeof item.errorMessage === "string" ? item.errorMessage : null,
    triggeredById: typeof item.triggeredById === "string" ? item.triggeredById : null,
    triggerSource: String(item.triggerSource ?? "manual"),
    deliveryChannel: String(item.deliveryChannel ?? "download"),
    deliveredAt: typeof item.deliveredAt === "string" ? item.deliveredAt : null,
    createdAt: String(item.createdAt ?? ""),
    updatedAt: String(item.updatedAt ?? ""),
  };
}

export async function listReportDefinitions() {
  const response = await authorizedBackendJson<Array<Record<string, unknown>>>("/reporting/definitions");
  return response.map(normalizeDefinition);
}

export async function getReportDefinition(id: string) {
  const response = await authorizedBackendJson<Record<string, unknown>>(`/reporting/definitions/${id}`);
  return normalizeDefinition(response);
}

export async function createReportDefinition(input: {
  name: string;
  description?: string;
  reportType: string;
  querySpec?: Record<string, unknown>;
  defaultFormat?: string;
  isScheduled?: boolean;
  cronExpression?: string;
  deliveryChannel?: string;
  deliveryConfig?: Record<string, unknown>;
  classification?: number;
}) {
  const response = await authorizedBackendJson<Record<string, unknown>>("/reporting/definitions", {
    method: "POST",
    body: JSON.stringify(input),
  });

  return normalizeDefinition(response);
}

export async function triggerReportExecution(
  definitionId: string,
  parameters: Record<string, unknown> = {},
) {
  const response = await authorizedBackendJson<Record<string, unknown>>(`/reporting/definitions/${definitionId}/run`, {
    method: "POST",
    body: JSON.stringify({ parameters }),
  });

  return normalizeExecution(response);
}

export async function getReportExecution(id: string) {
  const response = await authorizedBackendJson<Record<string, unknown>>(`/reporting/executions/${id}`);
  return normalizeExecution(response);
}

export async function listReportExecutions(definitionId: string, limit = 20) {
  const response = await authorizedBackendJson<Array<Record<string, unknown>>>(
    `/reporting/definitions/${definitionId}/executions?limit=${limit}`,
  );
  return response.map(normalizeExecution);
}
