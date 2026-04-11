/**
 * HeatmapLayer — renders incident density as a heatmap overlay.
 * Fetches density points from GET /gis/heatmap, then adds them as a
 * MapLibre heatmap layer for smooth GPU-accelerated rendering.
 * Updates on viewport pan/zoom and when date range filters change.
 */
import { useEffect, useRef, useCallback } from 'react';
import type { Map as MapLibreMap, GeoJSONSource } from 'maplibre-gl';
import { useMapStore } from '@/store/mapStore';
import { fetchHeatmap } from '@/api/gis';

const HEATMAP_SOURCE = 'incident-heatmap-source';
const HEATMAP_LAYER = 'incident-heatmap-layer';

function ensureHeatmapLayer(map: MapLibreMap) {
  if (!map.getSource(HEATMAP_SOURCE)) {
    map.addSource(HEATMAP_SOURCE, {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: [] },
    });
  }

  if (!map.getLayer(HEATMAP_LAYER)) {
    map.addLayer(
      {
        id: HEATMAP_LAYER,
        type: 'heatmap',
        source: HEATMAP_SOURCE,
        paint: {
          // Increase weight based on the normalized density
          'heatmap-weight': ['interpolate', ['linear'], ['get', 'weight'], 0, 0, 1, 1],
          // Increase intensity as zoom increases
          'heatmap-intensity': ['interpolate', ['linear'], ['zoom'], 0, 1, 12, 3],
          // Color ramp: blue → cyan → yellow → red
          'heatmap-color': [
            'interpolate',
            ['linear'],
            ['heatmap-density'],
            0,    'rgba(33,102,172,0)',
            0.2,  'rgb(103,169,207)',
            0.4,  'rgb(209,229,240)',
            0.6,  'rgb(253,219,99)',
            0.8,  'rgb(239,138,98)',
            1,    'rgb(178,24,43)',
          ],
          'heatmap-radius': ['interpolate', ['linear'], ['zoom'], 0, 20, 12, 40],
          'heatmap-opacity': 0.75,
        },
      },
      // Insert below any label / incident circle layers for correct z-order
      'incidents-circle',
    );
  }
}

interface HeatmapLayerProps {
  visible: boolean;
  from?: string;
  to?: string;
  incidentType?: string;
}

export function HeatmapLayer({ visible, from, to, incidentType }: HeatmapLayerProps) {
  const map = useMapStore((s) => s.map);
  const abortRef = useRef<AbortController | null>(null);

  const refresh = useCallback(async (currentMap: MapLibreMap) => {
    const bounds = currentMap.getBounds();
    abortRef.current?.abort();
    abortRef.current = new AbortController();

    try {
      const { points } = await fetchHeatmap({
        minLon: bounds.getWest(),
        minLat: bounds.getSouth(),
        maxLon: bounds.getEast(),
        maxLat: bounds.getNorth(),
        from,
        to,
        incidentType,
      });

      const geojson: GeoJSON.FeatureCollection = {
        type: 'FeatureCollection',
        features: points.map((p) => ({
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [p.lng, p.lat] },
          properties: { weight: p.weight, count: p.count },
        })),
      };

      const src = currentMap.getSource(HEATMAP_SOURCE) as GeoJSONSource | undefined;
      src?.setData(geojson);
    } catch {
      // Aborted or network error — silently ignore
    }
  }, [from, to, incidentType]);

  useEffect(() => {
    if (!map) return;

    ensureHeatmapLayer(map);

    const vis = visible ? 'visible' : 'none';
    if (map.getLayer(HEATMAP_LAYER)) map.setLayoutProperty(HEATMAP_LAYER, 'visibility', vis);

    if (!visible) return;

    refresh(map);

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
