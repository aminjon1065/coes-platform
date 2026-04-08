import Link from "next/link";
import { listAnalyticsIncidents } from "@/lib/analytics";
import { createAnalyticsIncidentAction } from "../actions";

type AnalyticsIncidentsPageProps = {
  searchParams?: Promise<{
    status?: string;
    severity?: string;
    incidentType?: string;
    administrativeCode?: string;
    openOnly?: string;
  }>;
};

export default async function AnalyticsIncidentsPage({
  searchParams,
}: AnalyticsIncidentsPageProps) {
  const filters = (await searchParams) ?? {};
  const incidents = await listAnalyticsIncidents({
    status: filters.status,
    severity: filters.severity,
    incidentType: filters.incidentType,
    administrativeCode: filters.administrativeCode,
    openOnly: filters.openOnly === "true",
    limit: 50,
  });

  return (
    <div className="portal-stack">
      <section className="portal-panel">
        <div className="portal-section-head">
          <div>
            <span className="portal-pill">Incident registry</span>
            <h2>Analytics incidents</h2>
          </div>
        </div>
        <form className="portal-form" method="get">
          <label>
            Status
            <input className="portal-input" defaultValue={filters.status ?? ""} name="status" />
          </label>
          <label>
            Severity
            <input className="portal-input" defaultValue={filters.severity ?? ""} name="severity" />
          </label>
          <label>
            Incident type
            <input className="portal-input" defaultValue={filters.incidentType ?? ""} name="incidentType" />
          </label>
          <label>
            Administrative code
            <input className="portal-input" defaultValue={filters.administrativeCode ?? ""} name="administrativeCode" />
          </label>
          <label className="portal-check">
            <input defaultChecked={filters.openOnly === "true"} name="openOnly" type="checkbox" value="true" />
            <span>Open only</span>
          </label>
          <button className="portal-button" type="submit">
            Apply filters
          </button>
        </form>
      </section>

      <section className="portal-panel">
        <div className="portal-section-head">
          <h2>Register incident</h2>
        </div>
        <form action={createAnalyticsIncidentAction} className="portal-form">
          <label>
            Incident reference
            <input className="portal-input" name="incidentRef" required />
          </label>
          <label>
            Title
            <input className="portal-input" name="title" required />
          </label>
          <label>
            Incident type
            <input className="portal-input" name="incidentType" required />
          </label>
          <label>
            Severity
            <select className="portal-input" defaultValue="moderate" name="severity">
              <option value="minor">minor</option>
              <option value="moderate">moderate</option>
              <option value="major">major</option>
              <option value="catastrophic">catastrophic</option>
            </select>
          </label>
          <label>
            Administrative code
            <input className="portal-input" name="administrativeCode" />
          </label>
          <label>
            Administrative name
            <input className="portal-input" name="administrativeName" />
          </label>
          <label>
            Classification
            <input className="portal-input" defaultValue="1" max="3" min="0" name="classification" type="number" />
          </label>
          <label>
            Affected population
            <input className="portal-input" min="0" name="affectedPopulation" type="number" />
          </label>
          <button className="portal-button" type="submit">
            Register incident
          </button>
        </form>
      </section>

      <section className="portal-panel">
        <div className="portal-section-head">
          <h2>Results</h2>
          <span className="portal-pill">{incidents.total} incidents</span>
        </div>
        <ul className="portal-list">
          {incidents.items.length === 0 ? (
            <li>No incidents match the current filters.</li>
          ) : (
            incidents.items.map((incident) => (
              <li key={incident.id}>
                <Link className="portal-item-link" href={`/analytics/incidents/${incident.id}`}>
                  <div className="portal-row">
                    <div>
                      <strong>{incident.title}</strong>
                      <p className="portal-note">
                        {incident.incidentRef} | {incident.incidentType} | {incident.severity} | {incident.status}
                      </p>
                      <p className="portal-note">
                        {incident.administrativeName ?? "No region"} | reported {incident.reportedAt}
                      </p>
                    </div>
                    <span className="portal-pill">
                      {incident.affectedPopulation ?? 0} affected
                    </span>
                  </div>
                </Link>
              </li>
            ))
          )}
        </ul>
      </section>
    </div>
  );
}
