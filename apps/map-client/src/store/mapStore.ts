import { create } from 'zustand';
import type { Map as MapLibreMap } from 'maplibre-gl';
import type { MapLayerVisibility } from '@/types/gis';
import type { IncidentLocation } from '@/types/incidents';

// ---------------------------------------------------------------------------
// Built-in layer IDs that are always registered in the map style
// ---------------------------------------------------------------------------
export const LAYER_IDS = {
  // Admin boundaries (from Martin vector tiles)
  ADMIN_BOUNDARIES_FILL:   'admin-boundaries-fill',
  ADMIN_BOUNDARIES_LINE:   'admin-boundaries-line',
  ADMIN_BOUNDARIES_LABEL:  'admin-boundaries-label',

  // Hazard zones (from Martin vector tiles)
  HAZARD_FLOOD_FILL:       'hazard-flood-fill',
  HAZARD_LANDSLIDE_FILL:   'hazard-landslide-fill',
  HAZARD_SEISMIC_FILL:     'hazard-seismic-fill',
  HAZARD_WILDFIRE_FILL:    'hazard-wildfire-fill',

  // Incident locations (GeoJSON source, refreshed dynamically)
  INCIDENTS_CIRCLE:        'incidents-circle',
  INCIDENTS_LABEL:         'incidents-label',

  // Heatmap for dense incident views
  INCIDENTS_HEATMAP:       'incidents-heatmap',
} as const;

// Default visibility for each layer
const DEFAULT_VISIBILITY: MapLayerVisibility = {
  [LAYER_IDS.ADMIN_BOUNDARIES_FILL]:  true,
  [LAYER_IDS.ADMIN_BOUNDARIES_LINE]:  true,
  [LAYER_IDS.ADMIN_BOUNDARIES_LABEL]: true,
  [LAYER_IDS.HAZARD_FLOOD_FILL]:      true,
  [LAYER_IDS.HAZARD_LANDSLIDE_FILL]:  true,
  [LAYER_IDS.HAZARD_SEISMIC_FILL]:    true,
  [LAYER_IDS.HAZARD_WILDFIRE_FILL]:   true,
  [LAYER_IDS.INCIDENTS_CIRCLE]:       true,
  [LAYER_IDS.INCIDENTS_LABEL]:        false,
  [LAYER_IDS.INCIDENTS_HEATMAP]:      false,
};

interface MapState {
  // MapLibre map instance — set once the map is loaded
  map: MapLibreMap | null;
  setMap: (map: MapLibreMap) => void;

  // Layer visibility
  layerVisibility: MapLayerVisibility;
  setLayerVisible: (layerId: string, visible: boolean) => void;
  toggleLayer: (layerId: string) => void;

  // Selected incident (shown in the detail popup)
  selectedIncident: IncidentLocation | null;
  selectIncident: (incident: IncidentLocation | null) => void;

  // Active incidents (kept in sync by useRealtimeUpdates)
  incidents: IncidentLocation[];
  setIncidents: (incidents: IncidentLocation[]) => void;
  addOrUpdateIncident: (incident: IncidentLocation) => void;

  // Map UI state
  isLayerPanelOpen: boolean;
  toggleLayerPanel: () => void;

  // Filter state
  severityFilter: number; // show incidents with severity >= this value (1 = all)
  setSeverityFilter: (severity: number) => void;
  statusFilter: string; // 'ALL' | 'ACTIVE' | 'MONITORING' | ...
  setStatusFilter: (status: string) => void;
}

export const useMapStore = create<MapState>((set, get) => ({
  map: null,
  setMap: (map) => set({ map }),

  layerVisibility: { ...DEFAULT_VISIBILITY },
  setLayerVisible: (layerId, visible) => {
    const { map } = get();
    if (map?.getLayer(layerId)) {
      map.setLayoutProperty(layerId, 'visibility', visible ? 'visible' : 'none');
    }
    set((s) => ({
      layerVisibility: { ...s.layerVisibility, [layerId]: visible },
    }));
  },
  toggleLayer: (layerId) => {
    const { layerVisibility, setLayerVisible } = get();
    setLayerVisible(layerId, !layerVisibility[layerId]);
  },

  selectedIncident: null,
  selectIncident: (incident) => set({ selectedIncident: incident }),

  incidents: [],
  setIncidents: (incidents) => set({ incidents }),
  addOrUpdateIncident: (incident) =>
    set((s) => {
      const idx = s.incidents.findIndex((i) => i.id === incident.id);
      if (idx === -1) return { incidents: [incident, ...s.incidents] };
      const next = [...s.incidents];
      next[idx] = incident;
      return { incidents: next };
    }),

  isLayerPanelOpen: true,
  toggleLayerPanel: () => set((s) => ({ isLayerPanelOpen: !s.isLayerPanelOpen })),

  severityFilter: 1,
  setSeverityFilter: (severity) => set({ severityFilter: severity }),

  statusFilter: 'ACTIVE',
  setStatusFilter: (status) => set({ statusFilter: status }),
}));
