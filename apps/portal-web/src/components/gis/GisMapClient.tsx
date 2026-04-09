"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import maplibregl, { GeoJSONSource, type Map as MapLibreMap } from "maplibre-gl";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { GisIncidentFeature, GisLayerListData } from "@/lib/gis";
import { useGisRealtime } from "./useGisRealtime";

const INITIAL_CENTER: [number, number] = [71.0, 38.8];
const INITIAL_ZOOM = 6;

const BASEMAP_STYLE = {
  version: 8 as const,
  glyphs: "https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf",
  sources: {
    "osm-raster": {
      type: "raster" as const,
      tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
      tileSize: 256,
      attribution: "OpenStreetMap contributors",
      maxzoom: 19,
    },
  },
  layers: [
    {
      id: "osm-raster-layer",
      type: "raster" as const,
      source: "osm-raster",
      paint: { "raster-opacity": 0.88 },
    },
  ],
};

function formatDateTime(value: string | null) {
  if (!value) return "Not set";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString("en-GB");
}

type GisMapClientProps = {
  incidents: GisIncidentFeature[];
  layers: GisLayerListData["items"];
  tileBaseUrl: string;
};

export function GisMapClient({ incidents, layers, tileBaseUrl }: GisMapClientProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const [liveIncidents, setLiveIncidents] = useState(incidents);
  const [selectedIncident, setSelectedIncident] = useState<GisIncidentFeature | null>(null);
  const [showIncidents, setShowIncidents] = useState(true);
  const [showBoundaries, setShowBoundaries] = useState(true);
  const [showHazards, setShowHazards] = useState(true);
  const { status, lastEventAt } = useGisRealtime({
    onIncidentUpsert: (incident) => {
      setLiveIncidents((current) => {
        const index = current.findIndex((item) => item.id === incident.id);
        if (index === -1) {
          return [incident, ...current];
        }

        const next = [...current];
        next[index] = incident;
        return next;
      });
      setSelectedIncident((current) => (current?.id === incident.id ? incident : current));
    },
  });

  useEffect(() => {
    setLiveIncidents(incidents);
  }, [incidents]);

  const incidentFeatureCollection = useMemo<GeoJSON.FeatureCollection>(
    () => ({
      type: "FeatureCollection",
      features: liveIncidents.map((incident) => ({
        type: "Feature",
        geometry: {
          type: "Point",
          coordinates: incident.coordinates,
        },
        properties: incident,
      })),
    }),
    [liveIncidents],
  );

  useEffect(() => {
    if (!containerRef.current || mapRef.current) {
      return;
    }

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: BASEMAP_STYLE,
      center: INITIAL_CENTER,
      zoom: INITIAL_ZOOM,
      minZoom: 4,
      maxZoom: 18,
      attributionControl: { compact: true },
    });

    map.addControl(new maplibregl.NavigationControl(), "top-right");
    map.addControl(new maplibregl.ScaleControl({ unit: "metric" }), "bottom-right");

    map.on("load", () => {
      if (!map.getSource("admin-boundaries")) {
        map.addSource("admin-boundaries", {
          type: "vector",
          tiles: [`${tileBaseUrl}/administrative_boundaries/{z}/{x}/{y}`],
          minzoom: 4,
          maxzoom: 14,
        });
      }

      if (!map.getSource("hazard-zones")) {
        map.addSource("hazard-zones", {
          type: "vector",
          tiles: [`${tileBaseUrl}/hazard_zones/{z}/{x}/{y}`],
          minzoom: 5,
          maxzoom: 14,
        });
      }

      if (!map.getSource("incidents")) {
        map.addSource("incidents", {
          type: "geojson",
          data: incidentFeatureCollection,
        });
      }

      map.addLayer({
        id: "admin-boundaries-line",
        type: "line",
        source: "admin-boundaries",
        "source-layer": "administrative_boundaries",
        paint: {
          "line-color": "#0f5d9c",
          "line-width": ["interpolate", ["linear"], ["zoom"], 4, 0.5, 10, 1.6],
          "line-opacity": 0.72,
        },
      });

      map.addLayer({
        id: "hazard-flood-fill",
        type: "fill",
        source: "hazard-zones",
        "source-layer": "hazard_zones",
        filter: ["==", ["get", "hazard_class"], "FLOOD"],
        paint: {
          "fill-color": "#2a7de1",
          "fill-opacity": 0.18,
        },
      });

      map.addLayer({
        id: "hazard-landslide-fill",
        type: "fill",
        source: "hazard-zones",
        "source-layer": "hazard_zones",
        filter: ["==", ["get", "hazard_class"], "LANDSLIDE"],
        paint: {
          "fill-color": "#bd7a14",
          "fill-opacity": 0.18,
        },
      });

      map.addLayer({
        id: "incidents-circle",
        type: "circle",
        source: "incidents",
        paint: {
          "circle-color": [
            "interpolate",
            ["linear"],
            ["get", "severityRank"],
            1,
            "#4caf50",
            3,
            "#f59e0b",
            5,
            "#b42318",
          ],
          "circle-radius": [
            "interpolate",
            ["linear"],
            ["zoom"],
            5,
            ["interpolate", ["linear"], ["get", "severityRank"], 1, 5, 5, 10],
            12,
            ["interpolate", ["linear"], ["get", "severityRank"], 1, 8, 5, 18],
          ],
          "circle-stroke-color": "#ffffff",
          "circle-stroke-width": 1.5,
        },
      });

      map.addLayer({
        id: "incidents-label",
        type: "symbol",
        source: "incidents",
        minzoom: 8,
        layout: {
          "text-field": ["get", "title"],
          "text-font": ["Open Sans Regular"],
          "text-size": 11,
          "text-offset": [0, 1.3],
          "text-anchor": "top",
        },
        paint: {
          "text-color": "#0f1728",
          "text-halo-color": "#ffffff",
          "text-halo-width": 1.2,
        },
      });

      map.on("click", "incidents-circle", (event) => {
        const feature = event.features?.[0];
        if (!feature?.properties) return;
        setSelectedIncident(feature.properties as unknown as GisIncidentFeature);
      });

      map.on("click", (event) => {
        const features = map.queryRenderedFeatures(event.point, {
          layers: ["incidents-circle"],
        });
        if (!features.length) {
          setSelectedIncident(null);
        }
      });
    });

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [incidentFeatureCollection, tileBaseUrl]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const source = map.getSource("incidents") as GeoJSONSource | undefined;
    source?.setData(incidentFeatureCollection);
  }, [incidentFeatureCollection]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map?.getLayer("incidents-circle")) return;
    map.setLayoutProperty("incidents-circle", "visibility", showIncidents ? "visible" : "none");
    map.setLayoutProperty("incidents-label", "visibility", showIncidents ? "visible" : "none");
  }, [showIncidents]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map?.getLayer("admin-boundaries-line")) return;
    map.setLayoutProperty(
      "admin-boundaries-line",
      "visibility",
      showBoundaries ? "visible" : "none",
    );
  }, [showBoundaries]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map?.getLayer("hazard-flood-fill")) return;
    for (const id of ["hazard-flood-fill", "hazard-landslide-fill"]) {
      map.setLayoutProperty(id, "visibility", showHazards ? "visible" : "none");
    }
  }, [showHazards]);

  const liveStatusLabel =
    status === "live" ? "live" : status === "connecting" ? "connecting" : "offline";

  return (
    <div className="relative overflow-hidden rounded-[2rem] border border-border/60 bg-white/90 shadow-sm">
      <div className="h-[620px] w-full" ref={containerRef} />

      <div className="pointer-events-none absolute inset-0">
        <div className="pointer-events-auto absolute left-4 top-4 w-[280px] rounded-3xl border border-border/70 bg-white/92 p-5 shadow-lg backdrop-blur">
          <div className="space-y-3">
            <div className="space-y-1">
              <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Visible overlays</p>
              <p className="text-sm text-muted-foreground">Control which map signals are currently displayed.</p>
            </div>
            <div className="space-y-3">
              <label className="flex items-center gap-3 rounded-2xl border border-border/70 bg-background/80 px-4 py-3 text-sm text-foreground">
                <input
                  checked={showBoundaries}
                  className="size-4 accent-[var(--primary)]"
                  onChange={() => setShowBoundaries((value) => !value)}
                  type="checkbox"
                />
                <span>Administrative boundaries</span>
              </label>
              <label className="flex items-center gap-3 rounded-2xl border border-border/70 bg-background/80 px-4 py-3 text-sm text-foreground">
                <input
                  checked={showHazards}
                  className="size-4 accent-[var(--primary)]"
                  onChange={() => setShowHazards((value) => !value)}
                  type="checkbox"
                />
                <span>Hazard fills</span>
              </label>
              <label className="flex items-center gap-3 rounded-2xl border border-border/70 bg-background/80 px-4 py-3 text-sm text-foreground">
                <input
                  checked={showIncidents}
                  className="size-4 accent-[var(--primary)]"
                  onChange={() => setShowIncidents((value) => !value)}
                  type="checkbox"
                />
                <span>Incident markers</span>
              </label>
            </div>
          </div>
        </div>

        <div className="pointer-events-auto absolute right-4 top-4 w-[220px] rounded-3xl border border-border/70 bg-white/92 p-5 shadow-lg backdrop-blur">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline">Live map slice</Badge>
              <Badge variant="secondary">{liveStatusLabel}</Badge>
            </div>
            <div>
              <p className="text-3xl font-semibold text-foreground">
                {liveIncidents.filter((item) => !item.resolvedAt).length}
              </p>
              <p className="text-sm text-muted-foreground">open incidents in current feed</p>
            </div>
            {lastEventAt ? (
              <p className="text-sm text-muted-foreground">Last event {formatDateTime(lastEventAt)}</p>
            ) : null}
          </div>
        </div>

        {selectedIncident ? (
          <div
            className="pointer-events-auto absolute bottom-4 left-1/2 w-[min(420px,calc(100%-32px))] -translate-x-1/2 rounded-3xl border border-border/70 bg-white/95 p-5 shadow-xl backdrop-blur"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-2">
                <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                  {selectedIncident.incidentType}
                </p>
                <h3 className="text-xl font-semibold text-foreground">{selectedIncident.title}</h3>
              </div>
              <Button type="button" variant="outline" onClick={() => setSelectedIncident(null)}>
                Close
              </Button>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <Badge variant="outline">{selectedIncident.incidentRef}</Badge>
              <Badge variant="secondary">severity {selectedIncident.severity}</Badge>
            </div>
            <div className="mt-4 space-y-2 text-sm text-muted-foreground">
              <p>
                {selectedIncident.coordinates[1].toFixed(4)}, {selectedIncident.coordinates[0].toFixed(4)}
              </p>
              <p>Reported {formatDateTime(selectedIncident.reportedAt)}</p>
              {selectedIncident.administrativeCode ? (
                <p>Admin code {selectedIncident.administrativeCode}</p>
              ) : null}
              {selectedIncident.elevationM != null ? (
                <p>Elevation {selectedIncident.elevationM} m</p>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>

      <div className="hidden">{layers.length}</div>
    </div>
  );
}
