/**
 * ClusterLayer — renders incident clusters on the MapLibre map.
 * Uses server-side PostGIS ST_SnapToGrid clustering via GET /gis/clusters.
 * Updates whenever the map viewport or zoom changes.
 */
import { useEffect, useRef, useCallback } from 'react';
import type { Map as MapLibreMap, GeoJSONSource } from 'maplibre-gl';
import { useMapStore } from '@/store/mapStore';
import { fetchClusters, type ClusterFeatureCollection } from '@/api/gis';

const CLUSTER_SOURCE = 'incident-clusters';
const CLUSTER_CIRCLE_LAYER = 'cluster-circles';
const CLUSTER_COUNT_LAYER = 'cluster-counts';

/** Add cluster source + layers to the map (idempotent). */
function ensureClusterLayers(map: MapLibreMap) {
  if (!map.getSource(CLUSTER_SOURCE)) {
    map.addSource(CLUSTER_SOURCE, {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: [] },
    });
  }

  if (!map.getLayer(CLUSTER_CIRCLE_LAYER)) {
    map.addLayer({
      id: CLUSTER_CIRCLE_LAYER,
      type: 'circle',
      source: CLUSTER_SOURCE,
      paint: {
        'circle-color': [
          'step',
          ['get', 'count'],
          '#51bbd6',   // 1–4
          5,  '#f1f075', // 5–19
          20, '#f28cb1', // 20+
        ],
        'circle-radius': [
          'step',
          ['get', 'count'],
          16,
          5,  22,
          20, 30,
        ],
        'circle-opacity': 0.85,
        'circle-stroke-color': '#fff',
        'circle-stroke-width': 1.5,
      },
    });
  }

  if (!map.getLayer(CLUSTER_COUNT_LAYER)) {
    map.addLayer({
      id: CLUSTER_COUNT_LAYER,
      type: 'symbol',
      source: CLUSTER_SOURCE,
      layout: {
        'text-field': ['get', 'count'],
        'text-font': ['Open Sans Bold'],
        'text-size': 12,
      },
      paint: {
        'text-color': '#fff',
      },
    });
  }
}

interface ClusterLayerProps {
  visible: boolean;
  openOnly?: boolean;
}

export function ClusterLayer({ visible, openOnly }: ClusterLayerProps) {
  const map = useMapStore((s) => s.map);
  const abortRef = useRef<AbortController | null>(null);

  const refresh = useCallback(async (currentMap: MapLibreMap) => {
    const bounds = currentMap.getBounds();
    const zoom = currentMap.getZoom();

    // Cancel any in-flight request
    abortRef.current?.abort();
    abortRef.current = new AbortController();

    try {
      const data = await fetchClusters({
        minLon: bounds.getWest(),
        minLat: bounds.getSouth(),
        maxLon: bounds.getEast(),
        maxLat: bounds.getNorth(),
        zoom,
        openOnly,
      });

      const src = currentMap.getSource(CLUSTER_SOURCE) as GeoJSONSource | undefined;
      src?.setData(data as unknown as ClusterFeatureCollection);
    } catch {
      // Aborted or network error — silently ignore
    }
  }, [openOnly]);

  useEffect(() => {
    if (!map) return;

    ensureClusterLayers(map);

    // Visibility toggle
    const vis = visible ? 'visible' : 'none';
    if (map.getLayer(CLUSTER_CIRCLE_LAYER)) map.setLayoutProperty(CLUSTER_CIRCLE_LAYER, 'visibility', vis);
    if (map.getLayer(CLUSTER_COUNT_LAYER)) map.setLayoutProperty(CLUSTER_COUNT_LAYER, 'visibility', vis);

    if (!visible) return;

    // Initial load
    refresh(map);

    // Refresh on moveend / zoomend
    const handler = () => refresh(map);
    map.on('moveend', handler);
    map.on('zoomend', handler);

    return () => {
      map.off('moveend', handler);
      map.off('zoomend', handler);
      abortRef.current?.abort();
    };
  }, [map, visible, refresh]);

  return null;
}
