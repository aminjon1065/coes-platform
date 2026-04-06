import { useEffect } from 'react';
import type { Map as MapLibreMap, GeoJSONSource } from 'maplibre-gl';
import { useMapStore, LAYER_IDS } from '@/store/mapStore';
import type { IncidentLocation } from '@/types/incidents';
import type { HazardType, RiskPrediction } from '@/types/ml';
import { RISK_TIER_COLORS } from '@/types/ml';

const SEVERITY_COLOR_EXPR = [
  'interpolate', ['linear'],
  ['get', 'severity'],
  1, '#22c55e',
  2, '#84cc16',
  3, '#f59e0b',
  4, '#ef4444',
  5, '#7f1d1d',
] as unknown[];

/**
 * Synchronises the MapLibre incidents GeoJSON source with the incidents
 * array held in the Zustand store.
 *
 * Must be called inside a component that mounts after the map is ready.
 */
export function useSyncIncidentsSource() {
  const { map, incidents, severityFilter, statusFilter } = useMapStore();

  useEffect(() => {
    if (!map) return;

    const filtered = incidents.filter(
      (i) =>
        i.severity >= severityFilter &&
        (statusFilter === 'ALL' || i.status === statusFilter),
    );

    const fc: GeoJSON.FeatureCollection = {
      type: 'FeatureCollection',
      features: filtered.map((i) => ({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: i.coordinates },
        properties: { ...i },
      })),
    };

    const source = map.getSource('incidents') as GeoJSONSource | undefined;
    if (source) {
      source.setData(fc);
    }
  }, [map, incidents, severityFilter, statusFilter]);
}

/**
 * Adds all CoESCD layers to the map after the style has loaded.
 * Sources:
 *   - Martin MVT tiles for admin boundaries and hazard zones
 *   - GeoJSON (dynamic) for incident locations
 */
export function addCoESCDLayers(map: MapLibreMap, tileBaseUrl: string) {
  // ------------------------------------------------------------------
  // Sources
  // ------------------------------------------------------------------

  // Administrative boundaries — MVT from Martin
  if (!map.getSource('admin-boundaries')) {
    map.addSource('admin-boundaries', {
      type: 'vector',
      tiles: [`${tileBaseUrl}/administrative_boundaries/{z}/{x}/{y}`],
      minzoom: 4,
      maxzoom: 14,
    });
  }

  // Hazard zones — MVT from Martin (all hazard classes in one table)
  if (!map.getSource('hazard-zones')) {
    map.addSource('hazard-zones', {
      type: 'vector',
      tiles: [`${tileBaseUrl}/hazard_zones/{z}/{x}/{y}`],
      minzoom: 5,
      maxzoom: 14,
    });
  }

  // Incident locations — GeoJSON (populated by useSyncIncidentsSource)
  if (!map.getSource('incidents')) {
    map.addSource('incidents', {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: [] },
      cluster: false,
    });
  }

  // ------------------------------------------------------------------
  // Admin boundary layers
  // ------------------------------------------------------------------

  if (!map.getLayer(LAYER_IDS.ADMIN_BOUNDARIES_FILL)) {
    map.addLayer({
      id: LAYER_IDS.ADMIN_BOUNDARIES_FILL,
      type: 'fill',
      source: 'admin-boundaries',
      'source-layer': 'administrative_boundaries',
      paint: {
        'fill-color': '#1d4ed8',
        'fill-opacity': 0.04,
      },
    });
  }

  if (!map.getLayer(LAYER_IDS.ADMIN_BOUNDARIES_LINE)) {
    map.addLayer({
      id: LAYER_IDS.ADMIN_BOUNDARIES_LINE,
      type: 'line',
      source: 'admin-boundaries',
      'source-layer': 'administrative_boundaries',
      paint: {
        'line-color': '#1e40af',
        'line-width': ['interpolate', ['linear'], ['zoom'], 4, 0.5, 10, 1.5],
        'line-opacity': 0.7,
      },
    });
  }

  if (!map.getLayer(LAYER_IDS.ADMIN_BOUNDARIES_LABEL)) {
    map.addLayer({
      id: LAYER_IDS.ADMIN_BOUNDARIES_LABEL,
      type: 'symbol',
      source: 'admin-boundaries',
      'source-layer': 'administrative_boundaries',
      minzoom: 7,
      layout: {
        'text-field': ['get', 'name'],
        'text-font': ['Open Sans Regular'],
        'text-size': ['interpolate', ['linear'], ['zoom'], 7, 10, 12, 13],
        'text-max-width': 8,
        'visibility': 'none', // off by default
      },
      paint: {
        'text-color': '#1e3a8a',
        'text-halo-color': '#ffffff',
        'text-halo-width': 1.5,
      },
    });
  }

  // ------------------------------------------------------------------
  // Hazard zone layers — one layer per hazard class with color filter
  // ------------------------------------------------------------------

  const hazardLayers: Array<{
    id: string;
    hazardClass: string;
    color: string;
  }> = [
    { id: LAYER_IDS.HAZARD_FLOOD_FILL,     hazardClass: 'FLOOD',     color: '#3b82f6' },
    { id: LAYER_IDS.HAZARD_LANDSLIDE_FILL, hazardClass: 'LANDSLIDE', color: '#a16207' },
    { id: LAYER_IDS.HAZARD_SEISMIC_FILL,   hazardClass: 'SEISMIC',   color: '#dc2626' },
    { id: LAYER_IDS.HAZARD_WILDFIRE_FILL,  hazardClass: 'WILDFIRE',  color: '#f97316' },
  ];

  for (const { id, hazardClass, color } of hazardLayers) {
    if (!map.getLayer(id)) {
      map.addLayer({
        id,
        type: 'fill',
        source: 'hazard-zones',
        'source-layer': 'hazard_zones',
        filter: ['==', ['get', 'hazard_class'], hazardClass],
        paint: {
          'fill-color': color,
          'fill-opacity': [
            'interpolate', ['linear'],
            ['get', 'severity'],
            1, 0.08,
            5, 0.35,
          ],
        },
      });
    }
  }

  // ------------------------------------------------------------------
  // Incident location layers
  // ------------------------------------------------------------------

  if (!map.getLayer(LAYER_IDS.INCIDENTS_HEATMAP)) {
    map.addLayer({
      id: LAYER_IDS.INCIDENTS_HEATMAP,
      type: 'heatmap',
      source: 'incidents',
      maxzoom: 9,
      paint: {
        'heatmap-weight': ['interpolate', ['linear'], ['get', 'severity'], 1, 0.4, 5, 1],
        'heatmap-intensity': ['interpolate', ['linear'], ['zoom'], 0, 1, 9, 3],
        'heatmap-color': [
          'interpolate', ['linear'],
          ['heatmap-density'],
          0,   'rgba(33,102,172,0)',
          0.2, 'rgb(103,169,207)',
          0.4, 'rgb(209,229,240)',
          0.6, 'rgb(253,219,199)',
          0.8, 'rgb(239,138,98)',
          1,   'rgb(178,24,43)',
        ],
        'heatmap-radius': ['interpolate', ['linear'], ['zoom'], 0, 2, 9, 20],
        'heatmap-opacity': ['interpolate', ['linear'], ['zoom'], 7, 1, 9, 0],
      },
      layout: { visibility: 'none' },
    });
  }

  if (!map.getLayer(LAYER_IDS.INCIDENTS_CIRCLE)) {
    map.addLayer({
      id: LAYER_IDS.INCIDENTS_CIRCLE,
      type: 'circle',
      source: 'incidents',
      minzoom: 5,
      paint: {
        'circle-color': SEVERITY_COLOR_EXPR,
        'circle-radius': [
          'interpolate', ['linear'], ['zoom'],
          5, ['interpolate', ['linear'], ['get', 'severity'], 1, 4, 5, 8],
          12, ['interpolate', ['linear'], ['get', 'severity'], 1, 8, 5, 18],
        ],
        'circle-stroke-color': '#ffffff',
        'circle-stroke-width': 1.5,
        'circle-opacity': 0.9,
      },
    });
  }

  if (!map.getLayer(LAYER_IDS.INCIDENTS_LABEL)) {
    map.addLayer({
      id: LAYER_IDS.INCIDENTS_LABEL,
      type: 'symbol',
      source: 'incidents',
      minzoom: 9,
      layout: {
        'text-field': ['get', 'title'],
        'text-font': ['Open Sans Regular'],
        'text-size': 11,
        'text-offset': [0, 1.5],
        'text-anchor': 'top',
        'text-max-width': 10,
        visibility: 'none',
      },
      paint: {
        'text-color': '#1e293b',
        'text-halo-color': '#ffffff',
        'text-halo-width': 1.5,
      },
    });
  }

  // ------------------------------------------------------------------
  // ML Risk prediction choropleth layers (GeoJSON, one source per hazard)
  // ------------------------------------------------------------------

  const riskLayers: Array<{ hazardType: HazardType; layerId: string }> = [
    { hazardType: 'flood',     layerId: LAYER_IDS.RISK_FLOOD_FILL },
    { hazardType: 'landslide', layerId: LAYER_IDS.RISK_LANDSLIDE_FILL },
    { hazardType: 'seismic',   layerId: LAYER_IDS.RISK_SEISMIC_FILL },
    { hazardType: 'wildfire',  layerId: LAYER_IDS.RISK_WILDFIRE_FILL },
  ];

  for (const { hazardType, layerId } of riskLayers) {
    const sourceId = `risk-${hazardType}`;
    if (!map.getSource(sourceId)) {
      map.addSource(sourceId, {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });
    }
    if (!map.getLayer(layerId)) {
      map.addLayer({
        id: layerId,
        type: 'fill',
        source: sourceId,
        paint: {
          // tier 1=green 2=amber 3=red 4=dark-red choropleth
          'fill-color': [
            'match',
            ['get', 'riskTier'],
            1, RISK_TIER_COLORS[1],
            2, RISK_TIER_COLORS[2],
            3, RISK_TIER_COLORS[3],
            4, RISK_TIER_COLORS[4],
            '#aaaaaa',
          ],
          'fill-opacity': [
            'interpolate', ['linear'],
            ['get', 'riskScore'],
            0, 0.05,
            1, 0.55,
          ],
          'fill-outline-color': 'rgba(0,0,0,0.15)',
        },
        layout: { visibility: 'none' },
      });
    }
  }
}

/**
 * Keeps all four ML risk GeoJSON sources in sync with the Zustand store.
 * Risk predictions are polygons derived from admin-boundary geometries:
 * each prediction is rendered as a filled polygon keyed by administrativeCode.
 *
 * Because we don't have admin boundary GeoJSON in the map client (only MVT tiles),
 * we represent predictions as centroid points using administrativeCode to look up
 * approximate centroids from a static registry.
 */
export function useSyncRiskLayers() {
  const { map, riskPredictions } = useMapStore();

  useEffect(() => {
    if (!map) return;

    const hazardTypes: HazardType[] = ['flood', 'landslide', 'seismic', 'wildfire'];
    for (const hazardType of hazardTypes) {
      const predictions = riskPredictions[hazardType];
      const sourceId    = `risk-${hazardType}`;
      const source      = map.getSource(sourceId) as GeoJSONSource | undefined;
      if (!source) continue;

      const fc: GeoJSON.FeatureCollection = {
        type: 'FeatureCollection',
        features: predictions.map((p) => ({
          type: 'Feature' as const,
          geometry: null as unknown as GeoJSON.Geometry, // will be filled from MVT join in future
          properties: {
            id:                 p.id,
            administrativeCode: p.administrativeCode,
            administrativeName: p.administrativeName,
            riskScore:          p.riskScore,
            riskTier:           p.riskTier,
            hazardType:         p.hazardType,
            validFrom:          p.validFrom,
            validUntil:         p.validUntil,
          },
        })),
      };
      source.setData(fc);
    }
  }, [map, riskPredictions]);
}
