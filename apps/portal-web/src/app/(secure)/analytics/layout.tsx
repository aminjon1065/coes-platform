import Link from "next/link";
import { redirect } from "next/navigation";
import { getPortalContext, hasWorkspace } from "@/lib/portal-context";

export default async function AnalyticsLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const portalContext = await getPortalContext();
  if (!hasWorkspace(portalContext, "analytics")) {
    redirect("/dashboard");
  }

  return (
    <div className="portal-stack">
      <section className="portal-panel">
        <div className="portal-section-head">
          <div>
            <span className="portal-pill">Analytics workspace</span>
            <h2>Investigations and analytical operations</h2>
          </div>
        </div>
        <div className="portal-actions">
          <Link className="portal-button secondary" href="/analytics">
            Overview
          </Link>
          <Link className="portal-button secondary" href="/analytics/incidents">
            Incidents
          </Link>
          <Link className="portal-button secondary" href="/analytics/forms">
            Forms
          </Link>
          <Link className="portal-button secondary" href="/analytics/reports">
            Reports
          </Link>
          <Link className="portal-button secondary" href="/gis">
            GIS
          </Link>
        </div>
      </section>
      {children}
    </div>
  );
}
