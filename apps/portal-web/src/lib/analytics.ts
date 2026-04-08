import { authorizedBackendJson } from "./auth";

export type PortalAnalyticsIncident = {
  id: string;
  incidentRef: string;
  title: string;
  incidentType: string;
  severity: string;
  status: string;
  administrativeCode: string | null;
  administrativeName: string | null;
  latitude: number | null;
  longitude: number | null;
  affectedAreaKm2: number | null;
  affectedPopulation: number | null;
  casualtiesConfirmed: number;
  casualtiesSuspected: number;
  responseTimeMinutes: number | null;
  resolutionTimeHours: number | null;
  classification: number;
  responsibleDeptId: string | null;
  reportedById: string;
  leadResponderId: string | null;
  reportedAt: string;
  firstResponseAt: string | null;
  resolvedAt: string | null;
  closedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type PortalAnalyticsResponse = {
  id: string;
  incidentId: string;
  action: string;
  description: string | null;
  locationNote: string | null;
  occurredAt: string;
  recordedById: string;
  resourcesUsed: Array<Record<string, unknown>>;
  outcome: string | null;
  createdAt: string;
};

export type PortalAnalyticsResourceDeployment = {
  id: string;
  incidentId: string;
  resourceType: string;
  resourceName: string;
  quantity: number;
  unit: string | null;
  deptId: string | null;
  deployedAt: string;
  withdrawnAt: string | null;
  costEstimate: number | null;
  notes: string | null;
  createdById: string;
  createdAt: string;
  updatedAt: string;
};

export type PortalAnalyticsForm = {
  id: string;
  name: string;
  description: string | null;
  incidentType: string | null;
  version: number;
  status: string;
  fieldCount: number;
  fields?: Array<Record<string, unknown>>;
  classification: number;
  createdById: string;
  publishedAt: string | null;
  updatedAt: string;
  submissionCount?: number;
};

export type PortalAnalyticsReport = {
  id: string;
  title: string;
  reportType: string;
  format: string;
  status: string;
  classification: number;
  rowCount: number | null;
  errorMessage: string | null;
  requestedById: string;
  periodFrom: string | null;
  periodTo: string | null;
  generatedAt: string | null;
  expiresAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type PortalAnalyticsSubmission = {
  id: string;
  formId: string;
  incidentId: string | null;
  incidentRef: string | null;
  status: string;
  data: Record<string, unknown>;
  locationLat: number | null;
  locationLon: number | null;
  submittedById: string;
  reviewedById: string | null;
  reviewNotes: string | null;
  submittedAt: string;
  reviewedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type PortalAnalyticsSummary = {
  totals: {
    totalIncidents: number;
    openIncidents: number;
    resolvedIncidents: number;
    catastrophicCount: number;
    majorCount: number;
    totalAffectedPopulation: number;
    totalCasualties: number;
    avgResponseTimeMin: number | null;
    p50ResponseTimeMin: number | null;
    p90ResponseTimeMin: number | null;
    avgResolutionTimeHours: number | null;
  };
  byType: Array<{
    incidentType: string;
    count: number;
    avgResponseMin: number | null;
  }>;
  byRegion: Array<{
    administrativeCode: string | null;
    administrativeName: string | null;
    count: number;
  }>;
  bySeverity: Array<{
    severity: string;
    count: number;
  }>;
  recentIncidents: PortalAnalyticsIncident[];
  forms: PortalAnalyticsForm[];
  reports: PortalAnalyticsReport[];
};

export type AnalyticsIncidentQuery = {
  status?: string;
  severity?: string;
  incidentType?: string;
  administrativeCode?: string;
  from?: string;
  to?: string;
  openOnly?: boolean;
  limit?: number;
  offset?: number;
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

function normalizeIncident(item: Record<string, unknown>): PortalAnalyticsIncident {
  return {
    id: String(item.id),
    incidentRef: String(item.incidentRef ?? ""),
    title: String(item.title ?? "Untitled incident"),
    incidentType: String(item.incidentType ?? "unknown"),
    severity: String(item.severity ?? "unknown"),
    status: String(item.status ?? "unknown"),
    administrativeCode:
      typeof item.administrativeCode === "string" ? item.administrativeCode : null,
    administrativeName:
      typeof item.administrativeName === "string" ? item.administrativeName : null,
    latitude: numberOrNull(item.latitude),
    longitude: numberOrNull(item.longitude),
    affectedAreaKm2: numberOrNull(item.affectedAreaKm2),
    affectedPopulation: numberOrNull(item.affectedPopulation),
    casualtiesConfirmed: Number(item.casualtiesConfirmed ?? 0),
    casualtiesSuspected: Number(item.casualtiesSuspected ?? 0),
    responseTimeMinutes: numberOrNull(item.responseTimeMinutes),
    resolutionTimeHours: numberOrNull(item.resolutionTimeHours),
    classification: Number(item.classification ?? 0),
    responsibleDeptId:
      typeof item.responsibleDeptId === "string" ? item.responsibleDeptId : null,
    reportedById: String(item.reportedById ?? ""),
    leadResponderId:
      typeof item.leadResponderId === "string" ? item.leadResponderId : null,
    reportedAt: String(item.reportedAt ?? ""),
    firstResponseAt:
      typeof item.firstResponseAt === "string" ? item.firstResponseAt : null,
    resolvedAt: typeof item.resolvedAt === "string" ? item.resolvedAt : null,
    closedAt: typeof item.closedAt === "string" ? item.closedAt : null,
    createdAt: String(item.createdAt ?? ""),
    updatedAt: String(item.updatedAt ?? ""),
  };
}

function normalizeResponse(item: Record<string, unknown>): PortalAnalyticsResponse {
  return {
    id: String(item.id),
    incidentId: String(item.incidentId ?? ""),
    action: String(item.action ?? "unknown"),
    description: typeof item.description === "string" ? item.description : null,
    locationNote: typeof item.locationNote === "string" ? item.locationNote : null,
    occurredAt: String(item.occurredAt ?? ""),
    recordedById: String(item.recordedById ?? ""),
    resourcesUsed: Array.isArray(item.resourcesUsed)
      ? item.resourcesUsed.filter((entry): entry is Record<string, unknown> => Boolean(entry && typeof entry === "object"))
      : [],
    outcome: typeof item.outcome === "string" ? item.outcome : null,
    createdAt: String(item.createdAt ?? ""),
  };
}

function normalizeResourceDeployment(item: Record<string, unknown>): PortalAnalyticsResourceDeployment {
  return {
    id: String(item.id),
    incidentId: String(item.incidentId ?? ""),
    resourceType: String(item.resourceType ?? "other"),
    resourceName: String(item.resourceName ?? "Unnamed resource"),
    quantity: Number(item.quantity ?? 0),
    unit: typeof item.unit === "string" ? item.unit : null,
    deptId: typeof item.deptId === "string" ? item.deptId : null,
    deployedAt: String(item.deployedAt ?? ""),
    withdrawnAt: typeof item.withdrawnAt === "string" ? item.withdrawnAt : null,
    costEstimate: numberOrNull(item.costEstimate),
    notes: typeof item.notes === "string" ? item.notes : null,
    createdById: String(item.createdById ?? ""),
    createdAt: String(item.createdAt ?? ""),
    updatedAt: String(item.updatedAt ?? ""),
  };
}

function normalizeForm(item: Record<string, unknown>): PortalAnalyticsForm {
  return {
    id: String(item.id),
    name: String(item.name ?? "Untitled form"),
    description: typeof item.description === "string" ? item.description : null,
    incidentType: typeof item.incidentType === "string" ? item.incidentType : null,
    version: Number(item.version ?? 1),
    status: String(item.status ?? "draft"),
    fieldCount: Array.isArray(item.fields) ? item.fields.length : 0,
    fields: Array.isArray(item.fields)
      ? item.fields.filter((entry): entry is Record<string, unknown> => Boolean(entry && typeof entry === "object"))
      : undefined,
    classification: Number(item.classification ?? 0),
    createdById: String(item.createdById ?? ""),
    publishedAt: typeof item.publishedAt === "string" ? item.publishedAt : null,
    updatedAt: String(item.updatedAt ?? ""),
    submissionCount: numberOrNull(item.submissionCount) ?? undefined,
  };
}

function normalizeReport(item: Record<string, unknown>): PortalAnalyticsReport {
  return {
    id: String(item.id),
    title: String(item.title ?? "Untitled report"),
    reportType: String(item.reportType ?? "unknown"),
    format: String(item.format ?? "json"),
    status: String(item.status ?? "unknown"),
    classification: Number(item.classification ?? 0),
    rowCount: numberOrNull(item.rowCount),
    errorMessage: typeof item.errorMessage === "string" ? item.errorMessage : null,
    requestedById: String(item.requestedById ?? ""),
    periodFrom: typeof item.periodFrom === "string" ? item.periodFrom : null,
    periodTo: typeof item.periodTo === "string" ? item.periodTo : null,
    generatedAt: typeof item.generatedAt === "string" ? item.generatedAt : null,
    expiresAt: typeof item.expiresAt === "string" ? item.expiresAt : null,
    createdAt: String(item.createdAt ?? ""),
    updatedAt: String(item.updatedAt ?? ""),
  };
}

function normalizeSubmission(item: Record<string, unknown>): PortalAnalyticsSubmission {
  return {
    id: String(item.id),
    formId: String(item.formId ?? ""),
    incidentId: typeof item.incidentId === "string" ? item.incidentId : null,
    incidentRef: typeof item.incidentRef === "string" ? item.incidentRef : null,
    status: String(item.status ?? "submitted"),
    data:
      item.data && typeof item.data === "object"
        ? (item.data as Record<string, unknown>)
        : {},
    locationLat: numberOrNull(item.locationLat),
    locationLon: numberOrNull(item.locationLon),
    submittedById: String(item.submittedById ?? ""),
    reviewedById: typeof item.reviewedById === "string" ? item.reviewedById : null,
    reviewNotes: typeof item.reviewNotes === "string" ? item.reviewNotes : null,
    submittedAt: String(item.submittedAt ?? ""),
    reviewedAt: typeof item.reviewedAt === "string" ? item.reviewedAt : null,
    createdAt: String(item.createdAt ?? ""),
    updatedAt: String(item.updatedAt ?? ""),
  };
}

function buildSearchParams(query: AnalyticsIncidentQuery | Record<string, string | number | boolean | undefined>) {
  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === "") {
      continue;
    }

    params.set(key, String(value));
  }

  return params.toString();
}

export async function listAnalyticsIncidents(query: AnalyticsIncidentQuery = {}) {
  const search = buildSearchParams(query);
  const response = await authorizedBackendJson<{
    items: Array<Record<string, unknown>>;
    total: number;
  }>(`/analytics/incidents${search ? `?${search}` : ""}`);

  return {
    total: response.total,
    items: response.items.map(normalizeIncident),
  };
}

export async function getAnalyticsIncident(id: string) {
  const response = await authorizedBackendJson<Record<string, unknown>>(`/analytics/incidents/${id}`);
  return normalizeIncident(response);
}

export async function createAnalyticsIncident(input: {
  incidentRef: string;
  title: string;
  incidentType: string;
  severity?: string;
  administrativeCode?: string;
  administrativeName?: string;
  latitude?: number;
  longitude?: number;
  affectedAreaKm2?: number;
  affectedPopulation?: number;
  classification: number;
  responsibleDeptId?: string;
  reportedAt?: string;
}) {
  const response = await authorizedBackendJson<Record<string, unknown>>("/analytics/incidents", {
    method: "POST",
    body: JSON.stringify(input),
  });

  return normalizeIncident(response);
}

export async function updateAnalyticsIncident(
  id: string,
  input: {
    severity?: string;
    status?: string;
    affectedPopulation?: number;
    casualtiesConfirmed?: number;
    casualtiesSuspected?: number;
    affectedAreaKm2?: number;
    internalNotes?: string;
    leadResponderId?: string;
    responsibleDeptId?: string;
  },
) {
  const response = await authorizedBackendJson<Record<string, unknown>>(`/analytics/incidents/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });

  return normalizeIncident(response);
}

export async function getAnalyticsIncidentResponses(id: string) {
  const response = await authorizedBackendJson<Array<Record<string, unknown>>>(`/analytics/incidents/${id}/responses`);
  return response.map(normalizeResponse);
}

export async function recordAnalyticsIncidentResponse(
  id: string,
  input: {
    action: string;
    description?: string;
    locationNote?: string;
    occurredAt?: string;
    outcome?: string;
  },
) {
  const response = await authorizedBackendJson<Record<string, unknown>>(`/analytics/incidents/${id}/responses`, {
    method: "POST",
    body: JSON.stringify(input),
  });

  return normalizeResponse(response);
}

export async function getAnalyticsIncidentResources(id: string) {
  const response = await authorizedBackendJson<Array<Record<string, unknown>>>(`/analytics/incidents/${id}/resources`);
  return response.map(normalizeResourceDeployment);
}

export async function deployAnalyticsResource(
  id: string,
  input: {
    resourceType: string;
    resourceName: string;
    quantity?: number;
    unit?: string;
    deptId?: string;
    deployedAt?: string;
    costEstimate?: number;
    notes?: string;
  },
) {
  const response = await authorizedBackendJson<Record<string, unknown>>(`/analytics/incidents/${id}/resources`, {
    method: "POST",
    body: JSON.stringify(input),
  });

  return normalizeResourceDeployment(response);
}

export async function withdrawAnalyticsResource(id: string) {
  const response = await authorizedBackendJson<Record<string, unknown>>(`/analytics/resources/${id}/withdraw`, {
    method: "PATCH",
  });

  return normalizeResourceDeployment(response);
}

export async function getAnalyticsIncidentStats(query: {
  incidentType?: string;
  administrativeCode?: string;
  from?: string;
  to?: string;
} = {}) {
  const search = buildSearchParams(query);
  const response = await authorizedBackendJson<{
    summary: Record<string, unknown>;
    byType: Array<Record<string, unknown>>;
    byRegion: Array<Record<string, unknown>>;
    bySeverity: Array<Record<string, unknown>>;
  }>(`/analytics/stats/incidents${search ? `?${search}` : ""}`);

  return {
    summary: {
      totalIncidents: Number(response.summary.total_incidents ?? 0),
      openIncidents: Number(response.summary.open_incidents ?? 0),
      resolvedIncidents: Number(response.summary.resolved_incidents ?? 0),
      catastrophicCount: Number(response.summary.catastrophic_count ?? 0),
      majorCount: Number(response.summary.major_count ?? 0),
      totalAffectedPopulation: Number(response.summary.total_affected_population ?? 0),
      totalCasualties: Number(response.summary.total_casualties ?? 0),
      avgResponseTimeMin: numberOrNull(response.summary.avg_response_time_min),
      p50ResponseTimeMin: numberOrNull(response.summary.p50_response_time_min),
      p90ResponseTimeMin: numberOrNull(response.summary.p90_response_time_min),
      avgResolutionTimeHours: numberOrNull(response.summary.avg_resolution_time_hours),
    },
    byType: response.byType.map((item) => ({
      incidentType: String(item.incident_type ?? "unknown"),
      count: Number(item.count ?? 0),
      avgResponseMin: numberOrNull(item.avg_response_min),
    })),
    byRegion: response.byRegion.map((item) => ({
      administrativeCode:
        typeof item.administrative_code === "string" ? item.administrative_code : null,
      administrativeName:
        typeof item.administrative_name === "string" ? item.administrative_name : null,
      count: Number(item.count ?? 0),
    })),
    bySeverity: response.bySeverity.map((item) => ({
      severity: String(item.severity ?? "unknown"),
      count: Number(item.count ?? 0),
    })),
  };
}

export async function listAnalyticsForms(incidentType?: string) {
  const search = buildSearchParams({ incidentType });
  const response = await authorizedBackendJson<Array<Record<string, unknown>>>(`/analytics/forms${search ? `?${search}` : ""}`);
  return response.map(normalizeForm);
}

export async function listAnalyticsFormRegistry() {
  const response = await authorizedBackendJson<Array<Record<string, unknown>>>("/analytics/forms/admin/registry");
  return response.map(normalizeForm);
}

export async function getAnalyticsForm(id: string) {
  const response = await authorizedBackendJson<Record<string, unknown>>(`/analytics/forms/${id}`);
  return normalizeForm(response);
}

export async function createAnalyticsForm(input: {
  name: string;
  description?: string;
  incidentType?: string;
  fields: Array<Record<string, unknown>>;
  classification: number;
}) {
  const response = await authorizedBackendJson<Record<string, unknown>>("/analytics/forms", {
    method: "POST",
    body: JSON.stringify(input),
  });

  return normalizeForm(response);
}

export async function publishAnalyticsForm(id: string) {
  const response = await authorizedBackendJson<Record<string, unknown>>(`/analytics/forms/${id}/publish`, {
    method: "PATCH",
  });

  return normalizeForm(response);
}

export async function listAnalyticsFormSubmissions(formId: string) {
  const response = await authorizedBackendJson<Array<Record<string, unknown>>>(`/analytics/forms/${formId}/submissions`);
  return response.map(normalizeSubmission);
}

export async function submitAnalyticsForm(
  formId: string,
  input: {
    incidentId?: string;
    incidentRef?: string;
    data: Record<string, unknown>;
    locationLat?: number;
    locationLon?: number;
  },
) {
  const response = await authorizedBackendJson<Record<string, unknown>>(`/analytics/forms/${formId}/submissions`, {
    method: "POST",
    body: JSON.stringify(input),
  });

  return normalizeSubmission(response);
}

export async function reviewAnalyticsSubmission(
  submissionId: string,
  input: {
    status: string;
    notes?: string;
  },
) {
  const response = await authorizedBackendJson<Record<string, unknown>>(`/analytics/submissions/${submissionId}/review`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });

  return normalizeSubmission(response);
}

export async function listAnalyticsReports() {
  const response = await authorizedBackendJson<Array<Record<string, unknown>>>("/analytics/reports");
  return response.map(normalizeReport);
}

export async function requestAnalyticsReport(input: {
  reportType: string;
  from?: string;
  to?: string;
  incidentType?: string;
  administrativeCode?: string;
  format?: string;
  classification?: number;
}) {
  const response = await authorizedBackendJson<Record<string, unknown>>("/analytics/reports", {
    method: "POST",
    body: JSON.stringify(input),
  });

  return normalizeReport(response);
}

export async function getAnalyticsWorkspaceSummary(): Promise<PortalAnalyticsSummary> {
  const [stats, incidents, forms, reports] = await Promise.all([
    getAnalyticsIncidentStats(),
    listAnalyticsIncidents({ limit: 6, openOnly: true }),
    listAnalyticsForms(),
    listAnalyticsReports(),
  ]);

  return {
    totals: stats.summary,
    byType: stats.byType,
    byRegion: stats.byRegion,
    bySeverity: stats.bySeverity,
    recentIncidents: incidents.items,
    forms: forms.slice(0, 5),
    reports: reports.slice(0, 5),
  };
}
