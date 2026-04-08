import Link from "next/link";
import { getAnalyticsWorkspaceSummary } from "@/lib/analytics";
import { getPortalContext } from "@/lib/portal-context";

export default async function AnalyticsPage() {
  const [summary, portalContext] = await Promise.all([
    getAnalyticsWorkspaceSummary(),
    getPortalContext(),
  ]);

  const analyticalCapabilities = portalContext.capabilities.filter(
    (capability) =>
      capability.startsWith("analytics.") ||
      capability.startsWith("gis.") ||
      (capability.startsWith("search.") && !capability.startsWith("search.admin.")),
  );

  return (
    <div className="portal-stack">
      <section className="portal-panel">
        <div className="portal-section-head">
          <div>
            <span className="portal-pill">Overview</span>
            <h2>Operational analytics summary</h2>
          </div>
          <Link className="portal-button secondary" href="/search">
            Open search
          </Link>
        </div>
        <p className="portal-note">
          The analytics workspace combines incident registry, statistical analysis,
          evidence collection forms, and generated reports on top of the shared core modules.
        </p>
      </section>

      <section className="portal-kpis">
        <div className="portal-kpi">
          Total incidents
          <strong>{summary.totals.totalIncidents}</strong>
        </div>
        <div className="portal-kpi">
          Open incidents
          <strong>{summary.totals.openIncidents}</strong>
        </div>
        <div className="portal-kpi">
          Major + catastrophic
          <strong>{summary.totals.majorCount + summary.totals.catastrophicCount}</strong>
        </div>
        <div className="portal-kpi">
          P90 response
          <strong>
            {summary.totals.p90ResponseTimeMin !== null ? `${summary.totals.p90ResponseTimeMin}m` : "n/a"}
          </strong>
        </div>
        <div className="portal-kpi">
          Published forms
          <strong>{summary.forms.length}</strong>
        </div>
        <div className="portal-kpi">
          Analytical capabilities
          <strong>{analyticalCapabilities.length}</strong>
        </div>
      </section>

      <section className="portal-columns">
        <article className="portal-panel">
          <div className="portal-section-head">
            <h2>Recent open incidents</h2>
            <Link className="portal-button secondary" href="/analytics/incidents">
              View all
            </Link>
          </div>
          <ul className="portal-list">
            {summary.recentIncidents.length === 0 ? (
              <li>No open incidents in the registry.</li>
            ) : (
              summary.recentIncidents.map((incident) => (
                <li key={incident.id}>
                  <Link className="portal-item-link" href={`/analytics/incidents/${incident.id}`}>
                    <div className="portal-row">
                      <div>
                        <strong>{incident.title}</strong>
                        <p className="portal-note">
                          {incident.incidentRef} | {incident.incidentType} | {incident.severity} | {incident.status}
                        </p>
                      </div>
                      <span className="portal-pill">
                        {incident.administrativeName ?? "No region"}
                      </span>
                    </div>
                  </Link>
                </li>
              ))
            )}
          </ul>
        </article>

        <article className="portal-panel">
          <div className="portal-section-head">
            <h2>Distribution</h2>
          </div>
          <ul className="portal-list">
            {summary.byType.length === 0 ? (
              <li>No incident distribution data available.</li>
            ) : (
              summary.byType.slice(0, 6).map((row) => (
                <li key={row.incidentType}>
                  <div className="portal-row">
                    <span>{row.incidentType}</span>
                    <strong>{row.count}</strong>
                  </div>
                </li>
              ))
            )}
          </ul>
        </article>
      </section>

      <section className="portal-columns">
        <article className="portal-panel">
          <div className="portal-section-head">
            <h2>Published forms</h2>
            <Link className="portal-button secondary" href="/analytics/forms">
              Open forms
            </Link>
          </div>
          <ul className="portal-list">
            {summary.forms.length === 0 ? (
              <li>No published forms available.</li>
            ) : (
              summary.forms.map((form) => (
                <li key={form.id}>
                  <strong>{form.name}</strong>
                  <p className="portal-note">
                    {form.incidentType ?? "Generic"} | v{form.version} | {form.fieldCount} fields
                  </p>
                </li>
              ))
            )}
          </ul>
        </article>

        <article className="portal-panel">
          <div className="portal-section-head">
            <h2>Recent reports</h2>
            <Link className="portal-button secondary" href="/analytics/reports">
              Open reports
            </Link>
          </div>
          <ul className="portal-list">
            {summary.reports.length === 0 ? (
              <li>No generated reports yet.</li>
            ) : (
              summary.reports.map((report) => (
                <li key={report.id}>
                  <strong>{report.title}</strong>
                  <p className="portal-note">
                    {report.reportType} | {report.format} | {report.status}
                  </p>
                </li>
              ))
            )}
          </ul>
        </article>
      </section>
    </div>
  );
}
