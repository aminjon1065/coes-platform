import { api } from './client';
import type { SpatialLayer } from '@/types/gis';

export interface LayersResponse {
  items: SpatialLayer[];
  total: number;
}

/** Fetch all published spatial layers the current user has access to. */
export function fetchLayers(): Promise<LayersResponse> {
  return api.get<LayersResponse>('/gis/layers?status=ACTIVE&limit=100');
}

/**
 * Martin tile server base URL.
 * In production this is the same origin via Nginx proxy (/tiles/).
 * In dev Vite proxies /tiles → http://localhost:3002.
 */
export const TILE_BASE_URL = import.meta.env.VITE_TILE_URL ?? '/tiles';

/** MVT tile URL template for a named PostGIS table served by Martin. */
export function martinTileUrl(tableName: string): string {
  return `${TILE_BASE_URL}/${tableName}/{z}/{x}/{y}`;
}

// ── Advanced analytics ────────────────────────────────────────────────────────

export interface ClusterFeature {
  type: 'Feature';
  geometry: { type: 'Point'; coordinates: [number, number] };
  properties: { count: number; incidentIds: string[]; severities: string[] };
}

export interface ClusterFeatureCollection {
  type: 'FeatureCollection';
  features: ClusterFeature[];
}

export interface ClusterParams {
  minLon: number;
  minLat: number;
  maxLon: number;
  maxLat: number;
  zoom: number;
  incidentType?: string;
  openOnly?: boolean;
}

/** Fetch clustered incident points for the current map viewport. */
export function fetchClusters(params: ClusterParams): Promise<ClusterFeatureCollection> {
  const q = new URLSearchParams({
    minLon: String(params.minLon),
    minLat: String(params.minLat),
    maxLon: String(params.maxLon),
    maxLat: String(params.maxLat),
    zoom: String(params.zoom),
    ...(params.incidentType ? { incidentType: params.incidentType } : {}),
    ...(params.openOnly ? { openOnly: 'true' } : {}),
  });
  return api.get<ClusterFeatureCollection>(`/gis/clusters?${q}`);
}

export interface HeatmapPoint {
  lng: number;
  lat: number;
  weight: number;
  count: number;
}

export interface HeatmapResponse {
  points: HeatmapPoint[];
  maxCount: number;
}

export interface HeatmapParams {
  minLon: number;
  minLat: number;
  maxLon: number;
  maxLat: number;
  from?: string;
  to?: string;
  incidentType?: string;
}

/** Fetch heatmap density data for the current map viewport. */
export function fetchHeatmap(params: HeatmapParams): Promise<HeatmapResponse> {
  const q = new URLSearchParams({
    minLon: String(params.minLon),
    minLat: String(params.minLat),
    maxLon: String(params.maxLon),
    maxLat: String(params.maxLat),
    ...(params.from ? { from: params.from } : {}),
    ...(params.to ? { to: params.to } : {}),
    ...(params.incidentType ? { incidentType: params.incidentType } : {}),
  });
  return api.get<HeatmapResponse>(`/gis/heatmap?${q}`);
}

export interface TimelineBucket {
  bucket: string;
  count: number;
  byType: Record<string, number>;
}

export interface TimelineResponse {
  granularity: string;
  from: string;
  to: string;
  buckets: TimelineBucket[];
}

export type TimelineGranularity = 'hour' | 'day' | 'week' | 'month';

export interface TimelineParams {
  granularity?: TimelineGranularity;
  from?: string;
  to?: string;
  incidentType?: string;
  administrativeCode?: string;
}

/** Fetch incident timeline for the slider / animation. */
export function fetchTimeline(params: TimelineParams): Promise<TimelineResponse> {
  const q = new URLSearchParams(
    Object.entries(params).filter(([, v]) => v !== undefined) as [string, string][],
  );
  return api.get<TimelineResponse>(`/gis/analytics/timeline?${q}`);
}
