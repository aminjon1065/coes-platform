import { useEffect, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useMapStore } from '@/store/mapStore';
import { addCoESCDLayers, useSyncIncidentsSource, useSyncRiskLayers } from '@/hooks/useMapLayers';
import { useRiskPredictions } from '@/hooks/useRiskPredictions';
import { IncidentPopup } from './IncidentPopup';
import { ReviewPanel } from '@/components/ML/ReviewPanel';
import type { IncidentLocation } from '@/types/incidents';

// Tajikistan center: Dushanbe approx. [68.77, 38.56]
const INITIAL_CENTER: [number, number] = [71.0, 38.8];
const INITIAL_ZOOM = 6;

const TILE_BASE = import.meta.env.VITE_TILE_URL ?? '/tiles';

// Free OpenStreetMap-compatible raster basemap (no API key required)
// For production, replace with a self-hosted basemap or licensed provider
const BASEMAP_STYLE = {
  version: 8 as const,
  glyphs: 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf',
  sources: {
    'osm-raster': {
      type: 'raster' as const,
      tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
      tileSize: 256,
      attribution: '© OpenStreetMap contributors',
      maxzoom: 19,
    },
  },
  layers: [
    {
      id: 'osm-raster-layer',
      type: 'raster' as const,
      source: 'osm-raster',
      paint: { 'raster-opacity': 0.85 },
    },
  ],
};

export function MapContainer() {
  const containerRef = useRef<HTMLDivElement>(null);
  const { setMap, selectIncident, selectPrediction } = useMapStore();

  // Sync incidents + risk layers whenever store data changes
  useSyncIncidentsSource();
  useSyncRiskLayers();
  useRiskPredictions();

  useEffect(() => {
    if (!containerRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: BASEMAP_STYLE,
      center: INITIAL_CENTER,
      zoom: INITIAL_ZOOM,
      minZoom: 4,
      maxZoom: 18,
      attributionControl: { compact: true },
    });

    map.addControl(new maplibregl.NavigationControl(), 'top-right');
    map.addControl(new maplibregl.ScaleControl({ unit: 'metric' }), 'bottom-right');
    map.addControl(
      new maplibregl.GeolocateControl({ positionOptions: { enableHighAccuracy: true } }),
      'top-right',
    );

    map.on('load', () => {
      addCoESCDLayers(map, TILE_BASE);
      setMap(map);
    });

    // Click handler — select incident on circle click
    map.on('click', 'incidents-circle', (e) => {
      if (!e.features?.length) return;
      const props = e.features[0].properties as IncidentLocation;
      const coords = (e.features[0].geometry as GeoJSON.Point).coordinates as [number, number];
      selectIncident({ ...props, coordinates: coords });
    });

    // Pointer cursor on hover
    map.on('mouseenter', 'incidents-circle', () => {
      map.getCanvas().style.cursor = 'pointer';
    });
    map.on('mouseleave', 'incidents-circle', () => {
      map.getCanvas().style.cursor = '';
    });

    // Click handler — select risk prediction cell
    const riskLayerIds = [
      'risk-flood-fill', 'risk-landslide-fill',
      'risk-seismic-fill', 'risk-wildfire-fill',
    ];
    for (const layerId of riskLayerIds) {
      map.on('click', layerId, (e) => {
        if (!e.features?.length) return;
        const props = e.features[0].properties as { id: string };
        // Lookup from store by id
        const { riskPredictions } = useMapStore.getState();
        for (const preds of Object.values(riskPredictions)) {
          const match = preds.find((p) => p.id === props.id);
          if (match) { selectPrediction(match); break; }
        }
      });
      map.on('mouseenter', layerId, () => {
        map.getCanvas().style.cursor = 'crosshair';
      });
      map.on('mouseleave', layerId, () => {
        map.getCanvas().style.cursor = '';
      });
    }

    // Dismiss popup on map click (not on marker)
    map.on('click', (e) => {
      const features = map.queryRenderedFeatures(e.point, {
        layers: ['incidents-circle'],
      });
      if (!features.length) selectIncident(null);
    });

    return () => {
      map.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="relative w-full h-full">
      <div ref={containerRef} className="w-full h-full" />
      <IncidentPopup />
      <ReviewPanel />
    </div>
  );
}
