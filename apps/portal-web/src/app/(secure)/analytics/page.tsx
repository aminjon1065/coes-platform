import Link from "next/link";
import { redirect } from "next/navigation";
import { getGisSummaryData } from "@/lib/gis";
import { getPortalContext, hasWorkspace } from "@/lib/portal-context";

export default async function AnalyticsPage() {
  const portalContext = await getPortalContext();
  if (!hasWorkspace(portalContext, "analytics")) {
    redirect("/dashboard");
  }
  const summary = await getGisSummaryData();
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
            <span className="portal-pill">Analytics workspace</span>
            <h2>Analytical operations</h2>
          </div>
          <Link className="portal-button secondary" href="/gis">
            Open GIS
          </Link>
        </div>
        <p className="portal-note">
          This workspace groups analytical and investigative tooling. Common standards such as
          EDMS, files, tasks, notifications, and chat remain available to everyone in the core workspace.
        </p>
      </section>

      <section className="portal-kpis">
        <div className="portal-kpi">
          Open incidents
          <strong>{summary.openIncidents}</strong>
        </div>
        <div className="portal-kpi">
          Total incidents
          <strong>{summary.totalIncidents}</strong>
        </div>
        <div className="portal-kpi">
          High severity
          <strong>{summary.highSeverityIncidents}</strong>
        </div>
        <div className="portal-kpi">
          Analytical capabilities
          <strong>{analyticalCapabilities.length}</strong>
        </div>
      </section>

      <section className="portal-columns">
        <article className="portal-panel">
          <div className="portal-section-head">
            <h2>Tools</h2>
          </div>
          <ul className="portal-list">
            <li><Link className="portal-item-link" href="/gis">GIS operations</Link></li>
            <li><Link className="portal-item-link" href="/search">Cross-domain search</Link></li>
            <li><Link className="portal-item-link" href="/edms">EDMS evidence and documents</Link></li>
            <li><Link className="portal-item-link" href="/files">Supporting files</Link></li>
          </ul>
        </article>

        <article className="portal-panel">
          <div className="portal-section-head">
            <h2>Top hazards</h2>
          </div>
          <ul className="portal-list">
            {summary.topHazards.length === 0 ? (
              <li>No hazard distribution data available.</li>
            ) : (
              summary.topHazards.map((hazard) => (
                <li key={hazard.hazard}>
                  <div className="portal-row">
                    <span>{hazard.hazard}</span>
                    <strong>{hazard.count}</strong>
                  </div>
                </li>
              ))
            )}
          </ul>
        </article>
      </section>
    </div>
  );
}
