import { api } from './client';
import type { IncidentFeatureCollection } from '@/types/incidents';

export interface IncidentQuery {
  status?: string;
  incidentType?: string;
  minSeverity?: number;
  limit?: number;
}

/**
 * Fetch active incident locations as a GeoJSON FeatureCollection.
 * The backend GIS controller returns incidents in GeoJSON format
 * for direct use as a MapLibre source.
 */
export function fetchIncidents(query: IncidentQuery = {}): Promise<IncidentFeatureCollection> {
  const params = new URLSearchParams();
  if (query.status) params.set('status', query.status);
  if (query.incidentType) params.set('incidentType', query.incidentType);
  if (query.minSeverity != null) params.set('minSeverity', String(query.minSeverity));
  params.set('limit', String(query.limit ?? 500));
  params.set('format', 'geojson');

  return api.get<IncidentFeatureCollection>(`/gis/incidents?${params}`);
}
