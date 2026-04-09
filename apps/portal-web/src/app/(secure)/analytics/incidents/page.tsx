import Link from "next/link";
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
    <div className="space-y-6">
      <Card className="border-border/60 bg-white/90 shadow-sm">
        <CardHeader className="gap-3">
          <Badge variant="outline" className="w-fit">
            Incident registry
          </Badge>
          <div className="space-y-1">
            <CardTitle className="font-heading text-3xl">Analytics incidents</CardTitle>
            <CardDescription>
              Filter the incident registry and review the latest field reports.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <form className="grid gap-4 md:grid-cols-2 xl:grid-cols-5" method="get">
            <label className="space-y-2 text-sm font-medium text-foreground">
              <span>Status</span>
              <Input defaultValue={filters.status ?? ""} name="status" />
            </label>
            <label className="space-y-2 text-sm font-medium text-foreground">
              <span>Severity</span>
              <Input defaultValue={filters.severity ?? ""} name="severity" />
            </label>
            <label className="space-y-2 text-sm font-medium text-foreground">
              <span>Incident type</span>
              <Input defaultValue={filters.incidentType ?? ""} name="incidentType" />
            </label>
            <label className="space-y-2 text-sm font-medium text-foreground">
              <span>Administrative code</span>
              <Input defaultValue={filters.administrativeCode ?? ""} name="administrativeCode" />
            </label>
            <label className="flex items-center gap-3 rounded-2xl border border-border/70 bg-muted/40 px-4 py-3 text-sm font-medium text-foreground">
              <input
                className="size-4 accent-[var(--primary)]"
                defaultChecked={filters.openOnly === "true"}
                name="openOnly"
                type="checkbox"
                value="true"
              />
              <span>Open only</span>
            </label>
            <div className="md:col-span-2 xl:col-span-5">
              <Button type="submit">Apply filters</Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card className="border-border/60 bg-white/90 shadow-sm">
        <CardHeader>
          <CardTitle className="font-heading text-2xl">Register incident</CardTitle>
          <CardDescription>
            Create a new entry in the operational incident registry.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={createAnalyticsIncidentAction} className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <label className="space-y-2 text-sm font-medium text-foreground">
              <span>Incident reference</span>
              <Input name="incidentRef" required />
            </label>
            <label className="space-y-2 text-sm font-medium text-foreground">
              <span>Title</span>
              <Input name="title" required />
            </label>
            <label className="space-y-2 text-sm font-medium text-foreground">
              <span>Incident type</span>
              <Input name="incidentType" required />
            </label>
            <label className="space-y-2 text-sm font-medium text-foreground">
              <span>Severity</span>
              <select
                className="flex h-12 w-full rounded-2xl border border-border/70 bg-white/70 px-4 py-3 text-sm text-foreground shadow-sm outline-none focus-visible:border-ring focus-visible:ring-4 focus-visible:ring-ring/15"
                defaultValue="moderate"
                name="severity"
              >
                <option value="minor">minor</option>
                <option value="moderate">moderate</option>
                <option value="major">major</option>
                <option value="catastrophic">catastrophic</option>
              </select>
            </label>
            <label className="space-y-2 text-sm font-medium text-foreground">
              <span>Administrative code</span>
              <Input name="administrativeCode" />
            </label>
            <label className="space-y-2 text-sm font-medium text-foreground">
              <span>Administrative name</span>
              <Input name="administrativeName" />
            </label>
            <label className="space-y-2 text-sm font-medium text-foreground">
              <span>Classification</span>
              <Input defaultValue="1" max="3" min="0" name="classification" type="number" />
            </label>
            <label className="space-y-2 text-sm font-medium text-foreground">
              <span>Affected population</span>
              <Input min="0" name="affectedPopulation" type="number" />
            </label>
            <div className="md:col-span-2 xl:col-span-4">
              <Button type="submit">Register incident</Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card className="border-border/60 bg-white/90 shadow-sm">
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <CardTitle className="font-heading text-2xl">Results</CardTitle>
            <CardDescription>Browse the incidents matching the current filters.</CardDescription>
          </div>
          <Badge variant="secondary">{incidents.total} incidents</Badge>
        </CardHeader>
        <CardContent>
          {incidents.items.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border/70 bg-muted/30 px-4 py-8 text-sm text-muted-foreground">
              No incidents match the current filters.
            </div>
          ) : (
            <div className="space-y-3">
              {incidents.items.map((incident) => (
                <Link
                  key={incident.id}
                  className="block rounded-3xl border border-border/70 bg-background/80 p-5 transition hover:border-primary/35 hover:shadow-sm"
                  href={`/analytics/incidents/${incident.id}`}
                >
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-lg font-semibold text-foreground">{incident.title}</h3>
                        <Badge variant="outline">{incident.status}</Badge>
                        <Badge variant="secondary">{incident.severity}</Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {incident.incidentRef} | {incident.incidentType} |{" "}
                        {incident.administrativeName ?? "No region"}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        Reported {incident.reportedAt}
                      </p>
                    </div>
                    <Badge className="h-fit">{incident.affectedPopulation ?? 0} affected</Badge>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
