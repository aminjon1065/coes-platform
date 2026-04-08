import { authorizedBackendJson } from "@/lib/auth";

type BackendSpatialLayer = {
  id: string;
  name: string;
  description: string | null;
  geometryType: string;
  status: string;
  classification: number;
  sourceName: string | null;
  sourceUrl: string | null;
  keywords: string[] | null;
  extentGeojson?: GeoJSON.Geometry | null;
};

type BackendIncident = {
  id: string;
  incidentRef: string;
  title: string;
  incidentType: string;
  severity: string;
  location: GeoJSON.Point;
  affectedArea?: GeoJSON.Geometry | null;
  administrativeCode: string | null;
  elevationM: number | null;
  distanceToRiverM?: number | null;
  distanceToRoadM?: number | null;
  classification: number;
  reportedAt: string;
  resolvedAt: string | null;
  createdAt?: string;
};

type BackendFeatureRecord = {
  id: string;
  externalId?: string | null;
  properties?: Record<string, unknown> | null;
  classification: number;
  geometry: GeoJSON.Geometry;
  distance_m?: number | null;
};

type BackendIncidentSummary = {
  administrative_code?: string | null;
  incident_type?: string | null;
  incident_count?: number | null;
};

type BackendPointEnrichment = {
  administrativeCode: string | null;
  administrativeName: string | null;
  adminLevel: string | null;
};

export type GisLayerListData = {
  total: number;
  items: Array<{
    id: string;
    name: string;
    description: string | null;
    geometryType: string;
    status: string;
    classification: number;
    sourceName: string | null;
    sourceUrl: string | null;
    keywords: string[];
  }>;
};

export type GisLayerDetail = {
  id: string;
  name: string;
  description: string | null;
  geometryType: string;
  status: string;
  classification: number;
  sourceName: string | null;
  sourceUrl: string | null;
  keywords: string[];
};

export type GisIncidentFeature = {
  id: string;
  incidentRef: string;
  title: string;
  incidentType: string;
  severity: string;
  severityRank: number;
  administrativeCode: string | null;
  classification: number;
  reportedAt: string;
  resolvedAt: string | null;
  coordinates: [number, number];
  elevationM: number | null;
  distanceToRiverM: number | null;
  distanceToRoadM: number | null;
};

export type GisIncidentData = {
  total: number;
  items: GisIncidentFeature[];
};

export type GisFeatureQueryResult = {
  total: number;
  items: Array<{
    id: string;
    externalId: string | null;
    classification: number;
    geometryType: string;
    distanceMetres: number | null;
    summary: string;
  }>;
};

export type GisSummaryData = {
  totalIncidents: number;
  openIncidents: number;
  highSeverityIncidents: number;
  topHazards: Array<{
    hazard: string;
    count: number;
  }>;
};

type ListLayerFilters = {
  status?: string;
  limit?: number;
  offset?: number;
};

type IncidentFilters = {
  incidentType?: string;
  openOnly?: boolean;
  limit?: number;
  offset?: number;
};

function normalizeValue(value: string) {
  return value.toLowerCase();
}

function severityToRank(value: string) {
  const normalized = normalizeValue(value);
  switch (normalized) {
    case "low":
      return 1;
    case "medium":
      return 2;
    case "significant":
      return 3;
    case "high":
      return 4;
    case "critical":
      return 5;
    default:
      return 0;
  }
}

function normalizeLayer(layer: BackendSpatialLayer) {
  return {
    id: layer.id,
    name: layer.name,
    description: layer.description,
    geometryType: normalizeValue(layer.geometryType),
    status: normalizeValue(layer.status),
    classification: layer.classification,
    sourceName: layer.sourceName,
    sourceUrl: layer.sourceUrl,
    keywords: layer.keywords ?? [],
  };
}

function normalizeIncident(incident: BackendIncident): GisIncidentFeature | null {
  if (!incident.location?.coordinates || incident.location.coordinates.length !== 2) {
    return null;
  }

  return {
    id: incident.id,
    incidentRef: incident.incidentRef,
    title: incident.title,
    incidentType: normalizeValue(incident.incidentType),
    severity: normalizeValue(incident.severity),
    severityRank: severityToRank(incident.severity),
    administrativeCode: incident.administrativeCode,
    classification: incident.classification,
    reportedAt: incident.reportedAt,
    resolvedAt: incident.resolvedAt,
    coordinates: incident.location.coordinates as [number, number],
    elevationM: incident.elevationM,
    distanceToRiverM: incident.distanceToRiverM ?? null,
    distanceToRoadM: incident.distanceToRoadM ?? null,
  };
}

function summarizeProperties(properties: Record<string, unknown> | null | undefined) {
  if (!properties) {
    return "No attributes";
  }

  const entries = Object.entries(properties).slice(0, 3);
  if (!entries.length) {
    return "No attributes";
  }

  return entries.map(([key, value]) => `${key}: ${String(value)}`).join(" · ");
}

export function getPortalTileBaseUrl() {
  return process.env.PORTAL_TILE_URL ?? "/tiles";
}

export async function getGisLayersData(
  filters: ListLayerFilters = {},
): Promise<GisLayerListData> {
  const searchParams = new URLSearchParams();
  if (filters.status) searchParams.set("status", filters.status);
  searchParams.set("limit", String(filters.limit ?? 100));
  searchParams.set("offset", String(filters.offset ?? 0));

  const response = await authorizedBackendJson<{
    items: BackendSpatialLayer[];
    total: number;
  }>(`/gis/layers?${searchParams.toString()}`);

  return {
    total: response.total,
    items: response.items.map(normalizeLayer),
  };
}

export async function getGisLayerDetail(layerId: string): Promise<GisLayerDetail> {
  const response = await authorizedBackendJson<BackendSpatialLayer>(`/gis/layers/${layerId}`);
  return normalizeLayer(response);
}

export async function getGisIncidentsData(
  filters: IncidentFilters = {},
): Promise<GisIncidentData> {
  const searchParams = new URLSearchParams();
  if (filters.incidentType) searchParams.set("incidentType", filters.incidentType);
  if (filters.openOnly) searchParams.set("openOnly", "true");
  searchParams.set("limit", String(filters.limit ?? 100));
  searchParams.set("offset", String(filters.offset ?? 0));

  const response = await authorizedBackendJson<{
    items: BackendIncident[];
    total: number;
  }>(`/gis/incidents?${searchParams.toString()}`);

  return {
    total: response.total,
    items: response.items.map(normalizeIncident).filter(Boolean) as GisIncidentFeature[],
  };
}

export async function getGisIncidentDetail(
  incidentId: string,
): Promise<GisIncidentFeature> {
  const response = await authorizedBackendJson<BackendIncident>(`/gis/incidents/${incidentId}`);
  const incident = normalizeIncident(response);
  if (!incident) {
    throw new Error("INVALID_INCIDENT");
  }
  return incident;
}

export async function resolveGisIncident(incidentId: string) {
  return authorizedBackendJson<void>(`/gis/incidents/${incidentId}/resolve`, {
    method: "PATCH",
  });
}

export async function reportGisIncident(payload: {
  incidentRef: string;
  title: string;
  incidentType: string;
  severity?: string;
  lon: number;
  lat: number;
  administrativeCode?: string;
  classification: number;
  reportedAt?: string;
}) {
  return authorizedBackendJson<void>("/gis/incidents", {
    method: "POST",
    body: JSON.stringify({
      incidentRef: payload.incidentRef,
      title: payload.title,
      incidentType: payload.incidentType,
      severity: payload.severity,
      location: {
        type: "Point",
        coordinates: [payload.lon, payload.lat],
      },
      administrativeCode: payload.administrativeCode,
      classification: payload.classification,
      reportedAt: payload.reportedAt,
    }),
  });
}

export async function queryLayerFeaturesByBbox(payload: {
  layerId: string;
  minLon: number;
  minLat: number;
  maxLon: number;
  maxLat: number;
  limit?: number;
}): Promise<GisFeatureQueryResult> {
  const searchParams = new URLSearchParams({
    minLon: String(payload.minLon),
    minLat: String(payload.minLat),
    maxLon: String(payload.maxLon),
    maxLat: String(payload.maxLat),
    limit: String(payload.limit ?? 50),
  });
  const response = await authorizedBackendJson<BackendFeatureRecord[]>(
    `/gis/layers/${payload.layerId}/features/bbox?${searchParams.toString()}`,
  );

  return {
    total: response.length,
    items: response.map((item) => ({
      id: item.id,
      externalId: item.externalId ?? null,
      classification: item.classification,
      geometryType: normalizeValue(item.geometry.type),
      distanceMetres: null,
      summary: summarizeProperties(item.properties),
    })),
  };
}

export async function queryLayerFeaturesByRadius(payload: {
  layerId: string;
  lon: number;
  lat: number;
  radiusMetres: number;
  limit?: number;
}): Promise<GisFeatureQueryResult> {
  const searchParams = new URLSearchParams({
    lon: String(payload.lon),
    lat: String(payload.lat),
    radiusMetres: String(payload.radiusMetres),
    limit: String(payload.limit ?? 50),
  });
  const response = await authorizedBackendJson<BackendFeatureRecord[]>(
    `/gis/layers/${payload.layerId}/features/radius?${searchParams.toString()}`,
  );

  return {
    total: response.length,
    items: response.map((item) => ({
      id: item.id,
      externalId: item.externalId ?? null,
      classification: item.classification,
      geometryType: normalizeValue(item.geometry.type),
      distanceMetres: item.distance_m ?? null,
      summary: summarizeProperties(item.properties),
    })),
  };
}

export async function enrichGisPoint(lon: number, lat: number) {
  const response = await authorizedBackendJson<BackendPointEnrichment>(
    `/gis/enrich/point?lon=${lon}&lat=${lat}`,
  );
  return {
    administrativeCode: response.administrativeCode,
    administrativeName: response.administrativeName,
    adminLevel: response.adminLevel ? normalizeValue(response.adminLevel) : null,
  };
}

export async function getGisSummaryData(): Promise<GisSummaryData> {
  const [allIncidents, openIncidents, summary] = await Promise.all([
    getGisIncidentsData({ limit: 250, offset: 0 }),
    getGisIncidentsData({ openOnly: true, limit: 250, offset: 0 }),
    authorizedBackendJson<BackendIncidentSummary[]>("/gis/analytics/incident-summary"),
  ]);

  const topHazards = summary
    .map((item) => ({
      hazard: normalizeValue(item.incident_type ?? "unknown"),
      count: item.incident_count ?? 0,
    }))
    .filter((item) => item.count > 0)
    .slice(0, 5);

  return {
    totalIncidents: allIncidents.total,
    openIncidents: openIncidents.total,
    highSeverityIncidents: allIncidents.items.filter((item) => item.severityRank >= 4).length,
    topHazards,
  };
}
