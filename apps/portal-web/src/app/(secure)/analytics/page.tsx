import Link from "next/link";
import { getAnalyticsWorkspaceSummary } from "@/lib/analytics";
import { getPortalContext } from "@/lib/portal-context";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

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

  const topCards = [
    { label: "Total incidents", value: summary.totals.totalIncidents },
    { label: "Open incidents", value: summary.totals.openIncidents },
    {
      label: "Major + catastrophic",
      value: summary.totals.majorCount + summary.totals.catastrophicCount,
    },
    {
      label: "P90 response",
      value: summary.totals.p90ResponseTimeMin !== null ? `${summary.totals.p90ResponseTimeMin}m` : "n/a",
    },
    { label: "Published forms", value: summary.forms.length },
    { label: "Analytical capabilities", value: analyticalCapabilities.length },
  ];

  return (
    <div className="space-y-6">
      <section className="grid gap-4 xl:grid-cols-[1.05fr_0.95fr]">
        <Card className="overflow-hidden border-white/70 bg-[linear-gradient(135deg,rgba(255,255,255,0.96),rgba(232,242,252,0.88))]">
          <CardHeader className="space-y-4">
            <Badge className="w-fit">Overview</Badge>
            <div className="space-y-3">
              <CardTitle className="font-display text-4xl leading-tight">
                Operational analytics summary
              </CardTitle>
              <CardDescription className="max-w-2xl text-base">
                The analytics workspace combines incident registry, statistical analysis,
                evidence collection forms, and generated reports on top of the shared core modules.
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-3">
            <Button asChild variant="secondary">
              <Link href="/search">Open search</Link>
            </Button>
            <Button asChild variant="secondary">
              <Link href="/gis">Open GIS</Link>
            </Button>
          </CardContent>
        </Card>

        <Card className="border-white/70 bg-[linear-gradient(180deg,rgba(13,27,47,0.94),rgba(19,46,78,0.9))] text-white">
          <CardHeader>
            <CardDescription className="text-white/60">Workspace scope</CardDescription>
            <CardTitle className="font-display text-3xl text-white">
              {analyticalCapabilities.length} assigned capabilities
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {analyticalCapabilities.map((capability) => (
              <Badge className="border-white/10 bg-white/10 text-white" key={capability}>
                {capability}
              </Badge>
            ))}
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {topCards.map((card) => (
          <Card className="border-white/70" key={card.label}>
            <CardContent className="space-y-3 p-6">
              <p className="text-sm text-muted-foreground">{card.label}</p>
              <p className="font-display text-4xl text-foreground">{card.value}</p>
            </CardContent>
          </Card>
        ))}
      </section>

      <section className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-start justify-between gap-4">
            <div>
              <CardTitle className="font-display text-2xl">Recent open incidents</CardTitle>
              <CardDescription>Most recent incidents still active in the registry.</CardDescription>
            </div>
            <Button asChild size="sm" variant="secondary">
              <Link href="/analytics/incidents">View all</Link>
            </Button>
          </CardHeader>
          <CardContent>
            <ul className="space-y-3">
              {summary.recentIncidents.length === 0 ? (
                <li className="rounded-2xl border border-dashed border-border bg-background/70 p-4 text-sm text-muted-foreground">
                  No open incidents in the registry.
                </li>
              ) : (
                summary.recentIncidents.map((incident) => (
                  <li className="rounded-3xl border border-border/70 bg-white/70 p-4" key={incident.id}>
                    <Link className="block space-y-2" href={`/analytics/incidents/${incident.id}`}>
                      <p className="font-semibold text-foreground">{incident.title}</p>
                      <p className="text-sm text-muted-foreground">
                        {incident.incidentRef} | {incident.incidentType} | {incident.severity} | {incident.status}
                      </p>
                      <Badge variant="secondary">{incident.administrativeName ?? "No region"}</Badge>
                    </Link>
                  </li>
                ))
              )}
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="font-display text-2xl">Distribution</CardTitle>
            <CardDescription>Incident type concentration across the workspace.</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-3">
              {summary.byType.length === 0 ? (
                <li className="rounded-2xl border border-dashed border-border bg-background/70 p-4 text-sm text-muted-foreground">
                  No incident distribution data available.
                </li>
              ) : (
                summary.byType.slice(0, 6).map((row) => (
                  <li className="flex items-center justify-between rounded-3xl border border-border/70 bg-white/70 p-4" key={row.incidentType}>
                    <span className="text-foreground">{row.incidentType}</span>
                    <strong className="font-display text-2xl text-foreground">{row.count}</strong>
                  </li>
                ))
              )}
            </ul>
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-start justify-between gap-4">
            <div>
              <CardTitle className="font-display text-2xl">Published forms</CardTitle>
              <CardDescription>Available analytical forms for evidence collection.</CardDescription>
            </div>
            <Button asChild size="sm" variant="secondary">
              <Link href="/analytics/forms">Open forms</Link>
            </Button>
          </CardHeader>
          <CardContent>
            <ul className="space-y-3">
              {summary.forms.length === 0 ? (
                <li className="rounded-2xl border border-dashed border-border bg-background/70 p-4 text-sm text-muted-foreground">
                  No published forms available.
                </li>
              ) : (
                summary.forms.map((form) => (
                  <li className="rounded-3xl border border-border/70 bg-white/70 p-4" key={form.id}>
                    <p className="font-semibold text-foreground">{form.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {form.incidentType ?? "Generic"} | v{form.version} | {form.fieldCount} fields
                    </p>
                  </li>
                ))
              )}
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-start justify-between gap-4">
            <div>
              <CardTitle className="font-display text-2xl">Recent reports</CardTitle>
              <CardDescription>Latest analytical report requests and outputs.</CardDescription>
            </div>
            <Button asChild size="sm" variant="secondary">
              <Link href="/analytics/reports">Open reports</Link>
            </Button>
          </CardHeader>
          <CardContent>
            <ul className="space-y-3">
              {summary.reports.length === 0 ? (
                <li className="rounded-2xl border border-dashed border-border bg-background/70 p-4 text-sm text-muted-foreground">
                  No generated reports yet.
                </li>
              ) : (
                summary.reports.map((report) => (
                  <li className="rounded-3xl border border-border/70 bg-white/70 p-4" key={report.id}>
                    <p className="font-semibold text-foreground">{report.title}</p>
                    <p className="text-sm text-muted-foreground">
                      {report.reportType} | {report.format} | {report.status}
                    </p>
                  </li>
                ))
              )}
            </ul>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
