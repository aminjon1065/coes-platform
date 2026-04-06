export type IncidentType =
  | 'FLOOD'
  | 'LANDSLIDE'
  | 'EARTHQUAKE'
  | 'WILDFIRE'
  | 'AVALANCHE'
  | 'INDUSTRIAL_ACCIDENT'
  | 'INFRASTRUCTURE_FAILURE'
  | 'OTHER';

export type IncidentStatus = 'ACTIVE' | 'MONITORING' | 'RESOLVED' | 'ARCHIVED';

export interface IncidentLocation {
  id: string;
  incidentType: IncidentType;
  severity: 1 | 2 | 3 | 4 | 5;
  status: IncidentStatus;
  title: string;
  description: string | null;
  adminCode: string | null;
  reportedAt: string; // ISO-8601
  resolvedAt: string | null;
  coordinates: [number, number]; // [lon, lat] WGS84
  affectedAreaKm2: number | null;
  affectedPopulation: number | null;
}

export interface IncidentFeature extends GeoJSON.Feature<GeoJSON.Point> {
  properties: Omit<IncidentLocation, 'coordinates'>;
}

export interface IncidentFeatureCollection extends GeoJSON.FeatureCollection<GeoJSON.Point> {
  features: IncidentFeature[];
}

// Real-time WebSocket event published when a new incident is reported
export interface IncidentReportedEvent {
  event: 'gis.incident.reported';
  data: IncidentLocation;
}

export const INCIDENT_TYPE_LABELS: Record<IncidentType, string> = {
  FLOOD: 'Flood',
  LANDSLIDE: 'Landslide',
  EARTHQUAKE: 'Earthquake',
  WILDFIRE: 'Wildfire',
  AVALANCHE: 'Avalanche',
  INDUSTRIAL_ACCIDENT: 'Industrial Accident',
  INFRASTRUCTURE_FAILURE: 'Infrastructure Failure',
  OTHER: 'Other',
};

export const INCIDENT_STATUS_LABELS: Record<IncidentStatus, string> = {
  ACTIVE: 'Active',
  MONITORING: 'Monitoring',
  RESOLVED: 'Resolved',
  ARCHIVED: 'Archived',
};

export const SEVERITY_LABELS: Record<number, string> = {
  1: 'Minor',
  2: 'Moderate',
  3: 'Significant',
  4: 'Severe',
  5: 'Catastrophic',
};
