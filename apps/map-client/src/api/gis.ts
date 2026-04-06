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
