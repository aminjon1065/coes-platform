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
import { GisMapClient } from "@/components/gis/GisMapClient";
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

export default async function GisPage({ searchParams }: GisPageProps) {
  const params = ((await searchParams) ?? {}) as SearchParams;
  const selectedLayerId =
    typeof params.layerId === "string" ? params.layerId : undefined;
  const selectedIncidentId =
    typeof params.incidentId === "string" ? params.incidentId : undefined;
  const queryMode =
    typeof params.queryMode === "string" ? params.queryMode : undefined;
  const lon = typeof params.lon === "string" ? Number(params.lon) : undefined;
  const lat = typeof params.lat === "string" ? Number(params.lat) : undefined;
  const radiusMetres =
    typeof params.radiusMetres === "string" ? Number(params.radiusMetres) : undefined;
  const minLon =
    typeof params.minLon === "string" ? Number(params.minLon) : undefined;
  const minLat =
    typeof params.minLat === "string" ? Number(params.minLat) : undefined;
  const maxLon =
    typeof params.maxLon === "string" ? Number(params.maxLon) : undefined;
  const maxLat =
    typeof params.maxLat === "string" ? Number(params.maxLat) : undefined;

  const [summary, incidents, layers] = await Promise.all([
    getGisSummaryData(),
    getGisIncidentsData({ openOnly: true, limit: 50, offset: 0 }),
    getGisLayersData({ status: "ACTIVE", limit: 50, offset: 0 }),
  ]);

  const [selectedLayer, selectedIncident, spatialResult, pointEnrichment] =
    await Promise.all([
      selectedLayerId ? getGisLayerDetail(selectedLayerId) : Promise.resolve(null),
      selectedIncidentId
        ? getGisIncidentDetail(selectedIncidentId)
        : Promise.resolve(null),
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
    <div className="portal-stack">
      <section className="portal-panel">
        <span className="portal-pill">GIS subsystem</span>
        <h2>Operational map</h2>
        <p className="portal-note">
          First portal slice: read-only layers, incidents and summary via portal BFF.
        </p>
      </section>

      <div className="gis-shell">
        <aside className="gis-sidebar">
          <section className="portal-panel">
            <div className="portal-section-head">
              <h2>Overview</h2>
            </div>
            <div className="gis-kpis">
              <div className="gis-kpi">
                <span className="portal-note">Total incidents</span>
                <strong>{summary.totalIncidents}</strong>
              </div>
              <div className="gis-kpi">
                <span className="portal-note">Open incidents</span>
                <strong>{summary.openIncidents}</strong>
              </div>
              <div className="gis-kpi">
                <span className="portal-note">High severity</span>
                <strong>{summary.highSeverityIncidents}</strong>
              </div>
              <div className="gis-kpi">
                <span className="portal-note">Visible layers</span>
                <strong>{layers.total}</strong>
              </div>
            </div>
          </section>

          <section className="portal-panel">
            <div className="portal-section-head">
              <h2>Hazard mix</h2>
            </div>
            <ul className="gis-layer-list">
              {summary.topHazards.length === 0 ? (
                <li className="gis-layer-item">No summary data.</li>
              ) : (
                summary.topHazards.map((hazard) => (
                  <li className="gis-layer-item" key={hazard.hazard}>
                    <strong>{hazard.hazard}</strong>
                    <p className="portal-note">{hazard.count} incidents</p>
                  </li>
                ))
              )}
            </ul>
          </section>

          <section className="portal-panel">
            <div className="portal-section-head">
              <h2>Active layers</h2>
            </div>
            <ul className="gis-layer-list">
              {layers.items.map((layer) => (
                <li className="gis-layer-item" key={layer.id}>
                  <strong>{layer.name}</strong>
                  <p className="portal-note">
                    {layer.geometryType} · class {layer.classification}
                  </p>
                  {layer.description ? <p className="portal-note">{layer.description}</p> : null}
                  <p className="portal-note">
                    <a href={`/gis?layerId=${layer.id}`}>Open layer detail</a>
                  </p>
                </li>
              ))}
            </ul>
          </section>

          <section className="portal-panel">
            <div className="portal-section-head">
              <h2>Recent incidents</h2>
            </div>
            <ul className="gis-incident-list">
              {incidents.items.slice(0, 6).map((incident) => (
                <li className="gis-incident-item" key={incident.id}>
                  <strong>{incident.title}</strong>
                  <p className="portal-note">
                    {incident.incidentType} · {incident.severity}
                  </p>
                  <p className="portal-note">{formatDateTime(incident.reportedAt)}</p>
                  <p className="portal-note">
                    <a href={`/gis?incidentId=${incident.id}`}>Inspect incident</a>
                  </p>
                </li>
              ))}
            </ul>
          </section>

          <section className="portal-panel">
            <div className="portal-section-head">
              <h2>Report incident</h2>
            </div>
            <form action={reportIncidentAction} className="portal-form">
              <div className="portal-columns portal-columns-tight">
                <label>
                  Incident ref
                  <input className="portal-input" name="incidentRef" required />
                </label>
                <label>
                  Type
                  <input className="portal-input" defaultValue="flood" name="incidentType" required />
                </label>
                <label>
                  Severity
                  <select className="portal-input" defaultValue="medium" name="severity">
                    <option value="low">low</option>
                    <option value="medium">medium</option>
                    <option value="significant">significant</option>
                    <option value="high">high</option>
                    <option value="critical">critical</option>
                  </select>
                </label>
                <label>
                  Classification
                  <input className="portal-input" defaultValue={1} max={3} min={0} name="classification" type="number" />
                </label>
                <label>
                  Lon
                  <input className="portal-input" name="lon" step="0.0001" type="number" required />
                </label>
                <label>
                  Lat
                  <input className="portal-input" name="lat" step="0.0001" type="number" required />
                </label>
              </div>
              <label>
                Title
                <input className="portal-input" name="title" required />
              </label>
              <label>
                Administrative code
                <input className="portal-input" name="administrativeCode" />
              </label>
              <button className="portal-button" type="submit">
                Report incident
              </button>
            </form>
          </section>
        </aside>

        <div className="portal-stack">
          <GisMapClient
            incidents={incidents.items}
            layers={layers.items}
            tileBaseUrl={getPortalTileBaseUrl()}
          />

          <section className="portal-columns">
            <article className="portal-panel">
              <div className="portal-section-head">
                <h2>Spatial query</h2>
              </div>
              <form className="portal-form" method="get">
                <label>
                  Layer
                  <select className="portal-input" defaultValue={selectedLayerId ?? layers.items[0]?.id ?? ""} name="layerId">
                    {layers.items.map((layer) => (
                      <option key={layer.id} value={layer.id}>
                        {layer.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Query mode
                  <select className="portal-input" defaultValue={queryMode ?? "radius"} name="queryMode">
                    <option value="radius">radius</option>
                    <option value="bbox">bbox</option>
                  </select>
                </label>
                <div className="portal-columns portal-columns-tight">
                  <label>
                    Lon
                    <input className="portal-input" defaultValue={lon ?? ""} name="lon" step="0.0001" type="number" />
                  </label>
                  <label>
                    Lat
                    <input className="portal-input" defaultValue={lat ?? ""} name="lat" step="0.0001" type="number" />
                  </label>
                  <label>
                    Radius metres
                    <input className="portal-input" defaultValue={radiusMetres ?? 10000} name="radiusMetres" type="number" />
                  </label>
                </div>
                <div className="portal-columns portal-columns-tight">
                  <label>
                    Min lon
                    <input className="portal-input" defaultValue={minLon ?? ""} name="minLon" step="0.0001" type="number" />
                  </label>
                  <label>
                    Min lat
                    <input className="portal-input" defaultValue={minLat ?? ""} name="minLat" step="0.0001" type="number" />
                  </label>
                  <label>
                    Max lon
                    <input className="portal-input" defaultValue={maxLon ?? ""} name="maxLon" step="0.0001" type="number" />
                  </label>
                  <label>
                    Max lat
                    <input className="portal-input" defaultValue={maxLat ?? ""} name="maxLat" step="0.0001" type="number" />
                  </label>
                </div>
                <button className="portal-button" type="submit">
                  Run spatial query
                </button>
              </form>
              {pointEnrichment ? (
                <p className="portal-note">
                  Point enrichment: {pointEnrichment.administrativeName ?? "unknown"} ·{" "}
                  {pointEnrichment.administrativeCode ?? "no-code"}
                </p>
              ) : null}
            </article>

            <article className="portal-panel">
              <div className="portal-section-head">
                <h2>Query results</h2>
              </div>
              {selectedLayer ? (
                <p className="portal-note">
                  Layer: {selectedLayer.name} · {selectedLayer.geometryType} · class{" "}
                  {selectedLayer.classification}
                </p>
              ) : (
                <p className="portal-note">Select a layer to inspect metadata and run queries.</p>
              )}
              <ul className="gis-layer-list">
                {spatialResult?.items.length ? (
                  spatialResult.items.map((item) => (
                    <li className="gis-layer-item" key={item.id}>
                      <strong>{item.externalId ?? item.id}</strong>
                      <p className="portal-note">
                        {item.geometryType} · class {item.classification}
                        {item.distanceMetres != null ? ` · ${item.distanceMetres} m` : ""}
                      </p>
                      <p className="portal-note">{item.summary}</p>
                    </li>
                  ))
                ) : (
                  <li className="gis-layer-item">No query results yet.</li>
                )}
              </ul>
            </article>
          </section>

          <section className="portal-columns">
            <article className="portal-panel">
              <div className="portal-section-head">
                <h2>Incident detail</h2>
              </div>
              {!selectedIncident ? (
                <p className="portal-note">Pick an incident from the recent list to inspect or resolve it.</p>
              ) : (
                <div className="portal-stack">
                  <div>
                    <strong>{selectedIncident.title}</strong>
                    <p className="portal-note">
                      {selectedIncident.incidentType} · {selectedIncident.severity}
                    </p>
                    <p className="portal-note">
                      {selectedIncident.coordinates[1].toFixed(4)}, {selectedIncident.coordinates[0].toFixed(4)}
                    </p>
                    <p className="portal-note">
                      Reported {formatDateTime(selectedIncident.reportedAt)}
                    </p>
                  </div>
                  {selectedIncident.resolvedAt ? (
                    <p className="portal-note">
                      Resolved {formatDateTime(selectedIncident.resolvedAt)}
                    </p>
                  ) : (
                    <form action={resolveIncidentAction}>
                      <input name="incidentId" type="hidden" value={selectedIncident.id} />
                      <button className="portal-button" type="submit">
                        Resolve incident
                      </button>
                    </form>
                  )}
                </div>
              )}
            </article>

            <article className="portal-panel">
              <div className="portal-section-head">
                <h2>Layer detail</h2>
              </div>
              {!selectedLayer ? (
                <p className="portal-note">Pick a layer from the list to inspect it.</p>
              ) : (
                <div className="portal-stack">
                  <div>
                    <strong>{selectedLayer.name}</strong>
                    <p className="portal-note">
                      {selectedLayer.geometryType} · {selectedLayer.status} · class {selectedLayer.classification}
                    </p>
                  </div>
                  {selectedLayer.description ? (
                    <p className="portal-note">{selectedLayer.description}</p>
                  ) : null}
                  {selectedLayer.sourceName ? (
                    <p className="portal-note">Source: {selectedLayer.sourceName}</p>
                  ) : null}
                  {selectedLayer.sourceUrl ? (
                    <p className="portal-note">{selectedLayer.sourceUrl}</p>
                  ) : null}
                </div>
              )}
            </article>
          </section>
        </div>
      </div>
    </div>
  );
}
