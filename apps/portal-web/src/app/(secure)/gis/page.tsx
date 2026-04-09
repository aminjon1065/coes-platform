import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { GisMapClient } from "@/components/gis/GisMapClient";
import {
  enrichGisPoint,
  getPortalTileBaseUrl,
  getGisIncidentDetail,
  getGisIncidentsData,
  getGisLayerDetail,
  getGisLayersData,
  getGisSummaryData,
  queryLayerFeaturesByBbox,
  queryLayerFeaturesByRadius,
} from "@/lib/gis";
import { reportIncidentAction, resolveIncidentAction } from "./actions";

function formatDateTime(value: string | null) {
  if (!value) return "Not set";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString("en-GB");
}

type SearchParams = Record<string, string | string[] | undefined>;

type GisPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function Select({
  children,
  defaultValue,
  name,
}: {
  children: ReactNode;
  defaultValue?: string;
  name: string;
}) {
  return (
    <select
      className="flex h-12 w-full rounded-2xl border border-border/70 bg-white/70 px-4 py-3 text-sm text-foreground shadow-sm outline-none focus-visible:border-ring focus-visible:ring-4 focus-visible:ring-ring/15"
      defaultValue={defaultValue}
      name={name}
    >
      {children}
    </select>
  );
}

export default async function GisPage({ searchParams }: GisPageProps) {
  const params = ((await searchParams) ?? {}) as SearchParams;
  const selectedLayerId = typeof params.layerId === "string" ? params.layerId : undefined;
  const selectedIncidentId = typeof params.incidentId === "string" ? params.incidentId : undefined;
  const queryMode = typeof params.queryMode === "string" ? params.queryMode : undefined;
  const lon = typeof params.lon === "string" ? Number(params.lon) : undefined;
  const lat = typeof params.lat === "string" ? Number(params.lat) : undefined;
  const radiusMetres = typeof params.radiusMetres === "string" ? Number(params.radiusMetres) : undefined;
  const minLon = typeof params.minLon === "string" ? Number(params.minLon) : undefined;
  const minLat = typeof params.minLat === "string" ? Number(params.minLat) : undefined;
  const maxLon = typeof params.maxLon === "string" ? Number(params.maxLon) : undefined;
  const maxLat = typeof params.maxLat === "string" ? Number(params.maxLat) : undefined;

  const [summary, incidents, layers] = await Promise.all([
    getGisSummaryData(),
    getGisIncidentsData({ openOnly: true, limit: 50, offset: 0 }),
    getGisLayersData({ status: "ACTIVE", limit: 50, offset: 0 }),
  ]);

  const [selectedLayer, selectedIncident, spatialResult, pointEnrichment] = await Promise.all([
    selectedLayerId ? getGisLayerDetail(selectedLayerId) : Promise.resolve(null),
    selectedIncidentId ? getGisIncidentDetail(selectedIncidentId) : Promise.resolve(null),
    selectedLayerId && queryMode === "radius" && lon != null && lat != null && radiusMetres
      ? queryLayerFeaturesByRadius({
          layerId: selectedLayerId,
          lon,
          lat,
          radiusMetres,
          limit: 25,
        })
      : selectedLayerId &&
          queryMode === "bbox" &&
          minLon != null &&
          minLat != null &&
          maxLon != null &&
          maxLat != null
        ? queryLayerFeaturesByBbox({
            layerId: selectedLayerId,
            minLon,
            minLat,
            maxLon,
            maxLat,
            limit: 25,
          })
        : Promise.resolve(null),
    lon != null && lat != null ? enrichGisPoint(lon, lat) : Promise.resolve(null),
  ]);

  return (
    <div className="space-y-6">
      <Card className="border-border/60 bg-white/90 shadow-sm">
        <CardHeader className="gap-3">
          <Badge variant="outline" className="w-fit">GIS subsystem</Badge>
          <div className="space-y-1">
            <CardTitle className="font-heading text-3xl">Operational map</CardTitle>
            <CardDescription>
              Read-only layers, live incidents, and spatial tools through the portal BFF.
            </CardDescription>
          </div>
        </CardHeader>
      </Card>

      <div className="grid gap-6 xl:grid-cols-[0.35fr_0.65fr]">
        <aside className="space-y-6">
          <Card className="border-border/60 bg-white/90 shadow-sm">
            <CardHeader>
              <CardTitle className="font-heading text-2xl">Overview</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-2xl border border-border/70 bg-muted/30 p-4"><p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Total incidents</p><p className="mt-2 text-2xl font-semibold text-foreground">{summary.totalIncidents}</p></div>
              <div className="rounded-2xl border border-border/70 bg-muted/30 p-4"><p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Open incidents</p><p className="mt-2 text-2xl font-semibold text-foreground">{summary.openIncidents}</p></div>
              <div className="rounded-2xl border border-border/70 bg-muted/30 p-4"><p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">High severity</p><p className="mt-2 text-2xl font-semibold text-foreground">{summary.highSeverityIncidents}</p></div>
              <div className="rounded-2xl border border-border/70 bg-muted/30 p-4"><p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Visible layers</p><p className="mt-2 text-2xl font-semibold text-foreground">{layers.total}</p></div>
            </CardContent>
          </Card>

          <Card className="border-border/60 bg-white/90 shadow-sm">
            <CardHeader><CardTitle className="font-heading text-2xl">Hazard mix</CardTitle></CardHeader>
            <CardContent>
              {summary.topHazards.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-border/70 bg-muted/30 px-4 py-8 text-sm text-muted-foreground">No summary data.</div>
              ) : (
                <div className="space-y-3">
                  {summary.topHazards.map((hazard) => (
                    <div className="rounded-2xl border border-border/70 bg-background/80 p-4" key={hazard.hazard}>
                      <p className="text-base font-semibold text-foreground">{hazard.hazard}</p>
                      <p className="mt-2 text-sm text-muted-foreground">{hazard.count} incidents</p>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="border-border/60 bg-white/90 shadow-sm">
            <CardHeader><CardTitle className="font-heading text-2xl">Active layers</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {layers.items.map((layer) => (
                <div className="rounded-2xl border border-border/70 bg-background/80 p-4" key={layer.id}>
                  <p className="text-base font-semibold text-foreground">{layer.name}</p>
                  <p className="mt-2 text-sm text-muted-foreground">{layer.geometryType} | class {layer.classification}</p>
                  {layer.description ? <p className="mt-2 text-sm text-muted-foreground">{layer.description}</p> : null}
                  <a className="mt-2 inline-flex text-sm font-medium text-primary transition hover:text-primary/80" href={`/gis?layerId=${layer.id}`}>Open layer detail</a>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card className="border-border/60 bg-white/90 shadow-sm">
            <CardHeader><CardTitle className="font-heading text-2xl">Recent incidents</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {incidents.items.slice(0, 6).map((incident) => (
                <div className="rounded-2xl border border-border/70 bg-background/80 p-4" key={incident.id}>
                  <p className="text-base font-semibold text-foreground">{incident.title}</p>
                  <p className="mt-2 text-sm text-muted-foreground">{incident.incidentType} | {incident.severity}</p>
                  <p className="mt-2 text-sm text-muted-foreground">{formatDateTime(incident.reportedAt)}</p>
                  <a className="mt-2 inline-flex text-sm font-medium text-primary transition hover:text-primary/80" href={`/gis?incidentId=${incident.id}`}>Inspect incident</a>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card className="border-border/60 bg-white/90 shadow-sm">
            <CardHeader>
              <CardTitle className="font-heading text-2xl">Report incident</CardTitle>
              <CardDescription>Create a new GIS-linked operational incident.</CardDescription>
            </CardHeader>
            <CardContent>
              <form action={reportIncidentAction} className="grid gap-4 md:grid-cols-2">
                <label className="space-y-2 text-sm font-medium text-foreground"><span>Incident ref</span><Input name="incidentRef" required /></label>
                <label className="space-y-2 text-sm font-medium text-foreground"><span>Type</span><Input defaultValue="flood" name="incidentType" required /></label>
                <label className="space-y-2 text-sm font-medium text-foreground"><span>Severity</span><Select defaultValue="medium" name="severity"><option value="low">low</option><option value="medium">medium</option><option value="significant">significant</option><option value="high">high</option><option value="critical">critical</option></Select></label>
                <label className="space-y-2 text-sm font-medium text-foreground"><span>Classification</span><Input defaultValue={1} max={3} min={0} name="classification" type="number" /></label>
                <label className="space-y-2 text-sm font-medium text-foreground"><span>Lon</span><Input name="lon" required step="0.0001" type="number" /></label>
                <label className="space-y-2 text-sm font-medium text-foreground"><span>Lat</span><Input name="lat" required step="0.0001" type="number" /></label>
                <label className="space-y-2 text-sm font-medium text-foreground md:col-span-2"><span>Title</span><Input name="title" required /></label>
                <label className="space-y-2 text-sm font-medium text-foreground md:col-span-2"><span>Administrative code</span><Input name="administrativeCode" /></label>
                <div className="md:col-span-2"><Button type="submit">Report incident</Button></div>
              </form>
            </CardContent>
          </Card>
        </aside>

        <div className="space-y-6">
          <GisMapClient incidents={incidents.items} layers={layers.items} tileBaseUrl={getPortalTileBaseUrl()} />

          <div className="grid gap-6 xl:grid-cols-2">
            <Card className="border-border/60 bg-white/90 shadow-sm">
              <CardHeader><CardTitle className="font-heading text-2xl">Spatial query</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <form className="grid gap-4" method="get">
                  <label className="space-y-2 text-sm font-medium text-foreground">
                    <span>Layer</span>
                    <Select defaultValue={selectedLayerId ?? layers.items[0]?.id ?? ""} name="layerId">
                      {layers.items.map((layer) => <option key={layer.id} value={layer.id}>{layer.name}</option>)}
                    </Select>
                  </label>
                  <label className="space-y-2 text-sm font-medium text-foreground">
                    <span>Query mode</span>
                    <Select defaultValue={queryMode ?? "radius"} name="queryMode">
                      <option value="radius">radius</option>
                      <option value="bbox">bbox</option>
                    </Select>
                  </label>
                  <div className="grid gap-4 md:grid-cols-3">
                    <label className="space-y-2 text-sm font-medium text-foreground"><span>Lon</span><Input defaultValue={lon ?? ""} name="lon" step="0.0001" type="number" /></label>
                    <label className="space-y-2 text-sm font-medium text-foreground"><span>Lat</span><Input defaultValue={lat ?? ""} name="lat" step="0.0001" type="number" /></label>
                    <label className="space-y-2 text-sm font-medium text-foreground"><span>Radius metres</span><Input defaultValue={radiusMetres ?? 10000} name="radiusMetres" type="number" /></label>
                  </div>
                  <div className="grid gap-4 md:grid-cols-2">
                    <label className="space-y-2 text-sm font-medium text-foreground"><span>Min lon</span><Input defaultValue={minLon ?? ""} name="minLon" step="0.0001" type="number" /></label>
                    <label className="space-y-2 text-sm font-medium text-foreground"><span>Min lat</span><Input defaultValue={minLat ?? ""} name="minLat" step="0.0001" type="number" /></label>
                    <label className="space-y-2 text-sm font-medium text-foreground"><span>Max lon</span><Input defaultValue={maxLon ?? ""} name="maxLon" step="0.0001" type="number" /></label>
                    <label className="space-y-2 text-sm font-medium text-foreground"><span>Max lat</span><Input defaultValue={maxLat ?? ""} name="maxLat" step="0.0001" type="number" /></label>
                  </div>
                  <Button type="submit">Run spatial query</Button>
                </form>
                {pointEnrichment ? (
                  <p className="text-sm text-muted-foreground">
                    Point enrichment: {pointEnrichment.administrativeName ?? "unknown"} | {pointEnrichment.administrativeCode ?? "no-code"}
                  </p>
                ) : null}
              </CardContent>
            </Card>

            <Card className="border-border/60 bg-white/90 shadow-sm">
              <CardHeader>
                <CardTitle className="font-heading text-2xl">Query results</CardTitle>
                <CardDescription>
                  {selectedLayer ? `Layer: ${selectedLayer.name} | ${selectedLayer.geometryType} | class ${selectedLayer.classification}` : "Select a layer to inspect metadata and run queries."}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {spatialResult?.items.length ? (
                  <div className="space-y-3">
                    {spatialResult.items.map((item) => (
                      <div className="rounded-2xl border border-border/70 bg-background/80 p-4" key={item.id}>
                        <p className="text-base font-semibold text-foreground">{item.externalId ?? item.id}</p>
                        <p className="mt-2 text-sm text-muted-foreground">
                          {item.geometryType} | class {item.classification}
                          {item.distanceMetres != null ? ` | ${item.distanceMetres} m` : ""}
                        </p>
                        <p className="mt-2 text-sm text-muted-foreground">{item.summary}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-2xl border border-dashed border-border/70 bg-muted/30 px-4 py-8 text-sm text-muted-foreground">No query results yet.</div>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-6 xl:grid-cols-2">
            <Card className="border-border/60 bg-white/90 shadow-sm">
              <CardHeader><CardTitle className="font-heading text-2xl">Incident detail</CardTitle></CardHeader>
              <CardContent>
                {!selectedIncident ? (
                  <p className="text-sm text-muted-foreground">Pick an incident from the recent list to inspect or resolve it.</p>
                ) : (
                  <div className="space-y-4">
                    <div>
                      <p className="text-lg font-semibold text-foreground">{selectedIncident.title}</p>
                      <p className="mt-2 text-sm text-muted-foreground">{selectedIncident.incidentType} | {selectedIncident.severity}</p>
                      <p className="mt-2 text-sm text-muted-foreground">{selectedIncident.coordinates[1].toFixed(4)}, {selectedIncident.coordinates[0].toFixed(4)}</p>
                      <p className="mt-2 text-sm text-muted-foreground">Reported {formatDateTime(selectedIncident.reportedAt)}</p>
                    </div>
                    {selectedIncident.resolvedAt ? (
                      <p className="text-sm text-muted-foreground">Resolved {formatDateTime(selectedIncident.resolvedAt)}</p>
                    ) : (
                      <form action={resolveIncidentAction}>
                        <input name="incidentId" type="hidden" value={selectedIncident.id} />
                        <Button type="submit">Resolve incident</Button>
                      </form>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="border-border/60 bg-white/90 shadow-sm">
              <CardHeader><CardTitle className="font-heading text-2xl">Layer detail</CardTitle></CardHeader>
              <CardContent>
                {!selectedLayer ? (
                  <p className="text-sm text-muted-foreground">Pick a layer from the list to inspect it.</p>
                ) : (
                  <div className="space-y-4">
                    <div>
                      <p className="text-lg font-semibold text-foreground">{selectedLayer.name}</p>
                      <p className="mt-2 text-sm text-muted-foreground">{selectedLayer.geometryType} | {selectedLayer.status} | class {selectedLayer.classification}</p>
                    </div>
                    {selectedLayer.description ? <p className="text-sm text-muted-foreground">{selectedLayer.description}</p> : null}
                    {selectedLayer.sourceName ? <p className="text-sm text-muted-foreground">Source: {selectedLayer.sourceName}</p> : null}
                    {selectedLayer.sourceUrl ? <p className="text-sm text-muted-foreground">{selectedLayer.sourceUrl}</p> : null}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
