import { requestAnalyticsReportAction } from "../actions";
import { listAnalyticsReports } from "@/lib/analytics";
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

export default async function AnalyticsReportsPage() {
  const reports = await listAnalyticsReports();

  return (
    <div className="space-y-6">
      <section className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
        <Card>
          <CardHeader>
            <Badge className="w-fit">Reports</Badge>
            <CardTitle className="font-display text-3xl">Request analytical report</CardTitle>
            <CardDescription>Generate a new analytical report from the portal workspace.</CardDescription>
          </CardHeader>
          <CardContent>
            <form action={requestAnalyticsReportAction} className="grid gap-4">
              <label className="grid gap-2 text-sm font-medium text-foreground">
                Report type
                <select className="flex h-12 w-full rounded-2xl border border-border/70 bg-white/70 px-4 py-3 text-sm text-foreground shadow-sm outline-none focus-visible:border-ring focus-visible:ring-4 focus-visible:ring-ring/15" defaultValue="incident_summary" name="reportType">
                  <option value="incident_summary">incident_summary</option>
                  <option value="response_performance">response_performance</option>
                  <option value="resource_utilisation">resource_utilisation</option>
                  <option value="trend_analysis">trend_analysis</option>
                  <option value="seasonal_pattern">seasonal_pattern</option>
                </select>
              </label>
              <div className="grid gap-4 md:grid-cols-2">
                <label className="grid gap-2 text-sm font-medium text-foreground">
                  From
                  <Input name="from" type="date" />
                </label>
                <label className="grid gap-2 text-sm font-medium text-foreground">
                  To
                  <Input name="to" type="date" />
                </label>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <label className="grid gap-2 text-sm font-medium text-foreground">
                  Incident type
                  <Input name="incidentType" />
                </label>
                <label className="grid gap-2 text-sm font-medium text-foreground">
                  Administrative code
                  <Input name="administrativeCode" />
                </label>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <label className="grid gap-2 text-sm font-medium text-foreground">
                  Format
                  <select className="flex h-12 w-full rounded-2xl border border-border/70 bg-white/70 px-4 py-3 text-sm text-foreground shadow-sm outline-none focus-visible:border-ring focus-visible:ring-4 focus-visible:ring-ring/15" defaultValue="json" name="format">
                    <option value="json">json</option>
                    <option value="csv">csv</option>
                    <option value="pdf">pdf</option>
                    <option value="xlsx">xlsx</option>
                  </select>
                </label>
                <label className="grid gap-2 text-sm font-medium text-foreground">
                  Classification
                  <Input defaultValue="1" max="3" min="0" name="classification" type="number" />
                </label>
              </div>
              <Button className="w-fit" type="submit">
                Request report
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="font-display text-3xl">Generated analytical reports</CardTitle>
            <CardDescription>Recent report outputs and pending requests.</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-3">
              {reports.length === 0 ? (
                <li className="rounded-2xl border border-dashed border-border bg-background/70 p-4 text-sm text-muted-foreground">
                  No reports generated yet.
                </li>
              ) : (
                reports.map((report) => (
                  <li className="rounded-3xl border border-border/70 bg-white/70 p-4" key={report.id}>
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-semibold text-foreground">{report.title}</p>
                        <Badge variant="secondary">{report.status}</Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {report.reportType} | {report.format}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        Rows {report.rowCount ?? 0} | generated {report.generatedAt ?? "pending"} | expires {report.expiresAt ?? "n/a"}
                      </p>
                    </div>
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
