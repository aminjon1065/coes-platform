export type HazardClass = 'FLOOD' | 'LANDSLIDE' | 'SEISMIC' | 'WILDFIRE';
export type LayerStatus = 'ACTIVE' | 'DEPRECATED' | 'DRAFT';
export type GeometryType = 'POINT' | 'LINESTRING' | 'POLYGON' | 'MULTIPOLYGON' | 'RASTER';

export interface SpatialLayer {
  id: string;
  name: string;
  description: string | null;
  layerType: string;
  geometryType: GeometryType;
  status: LayerStatus;
  classification: number;
  symbology: LayerSymbology | null;
  minZoom: number;
  maxZoom: number;
  tileUrl: string | null;
}

export interface LayerSymbology {
  color?: string;
  fillColor?: string;
  fillOpacity?: number;
  strokeColor?: string;
  strokeWidth?: number;
  iconName?: string;
  colorField?: string;
  colorStops?: Array<[number | string, string]>;
}

export interface HazardZone {
  id: string;
  hazardClass: HazardClass;
  severity: 1 | 2 | 3 | 4 | 5;
  name: string;
  description: string | null;
  geom: GeoJSON.Geometry;
  properties: Record<string, unknown>;
}

export interface AdministrativeBoundary {
  id: string;
  adminCode: string;
  name: string;
  nameRu: string | null;
  nameTjk: string | null;
  level: 1 | 2 | 3; // 1=oblast, 2=rayon, 3=jamoat
  geom: GeoJSON.Geometry;
}

// Layer groups shown in the UI panel
export interface LayerGroup {
  id: string;
  label: string;
  icon: string;
  layers: MapLayerConfig[];
}

export interface MapLayerConfig {
  id: string;
  label: string;
  sourceId: string;
  sourceLayer?: string;
  type: 'fill' | 'line' | 'circle' | 'symbol' | 'raster';
  paint: Record<string, unknown>;
  layout?: Record<string, unknown>;
  minzoom?: number;
  maxzoom?: number;
  filter?: unknown[];
  /** Whether this layer is visible by default */
  defaultVisible: boolean;
}

export type MapLayerVisibility = Record<string, boolean>;
