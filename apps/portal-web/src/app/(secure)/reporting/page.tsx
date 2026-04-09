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
import { Textarea } from "@/components/ui/textarea";
import { createReportDefinitionAction, triggerReportExecutionAction } from "./actions";
import { listReportDefinitions, listReportExecutions } from "@/lib/reporting";

export default async function ReportingPage() {
  const definitions = await listReportDefinitions();
  const latestExecutionEntries = await Promise.all(
    definitions.map(async (definition) => [
      definition.id,
      (await listReportExecutions(definition.id, 1))[0] ?? null,
    ] as const),
  );
  const latestExecutions = new Map(latestExecutionEntries);

  return (
    <div className="space-y-6">
      <Card className="border-border/60 bg-white/90 shadow-sm">
        <CardHeader className="gap-3">
          <Badge variant="outline" className="w-fit">
            Reporting
          </Badge>
          <div className="space-y-1">
            <CardTitle className="font-heading text-3xl">Report definitions and executions</CardTitle>
            <CardDescription>
              Manage reusable reports, schedule delivery, and trigger manual runs.
            </CardDescription>
          </div>
        </CardHeader>
      </Card>

      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <Card className="border-border/60 bg-white/90 shadow-sm">
          <CardHeader>
            <CardTitle className="font-heading text-2xl">Definitions</CardTitle>
            <CardDescription>Current reporting definitions and latest execution state.</CardDescription>
          </CardHeader>
          <CardContent>
            {definitions.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border/70 bg-muted/30 px-4 py-8 text-sm text-muted-foreground">
                No report definitions configured.
              </div>
            ) : (
              <div className="space-y-4">
                {definitions.map((definition) => {
                  const latestExecution = latestExecutions.get(definition.id);

                  return (
                    <div key={definition.id} className="rounded-3xl border border-border/70 bg-background/80 p-5">
                      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                        <div className="space-y-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <Link href={`/reporting/${definition.id}`}>
                              <h3 className="text-lg font-semibold text-foreground transition hover:text-primary">
                                {definition.name}
                              </h3>
                            </Link>
                            <Badge variant="outline">{definition.reportType}</Badge>
                          </div>
                          <p className="text-sm text-muted-foreground">
                            {definition.defaultFormat} | classification {definition.classification}
                          </p>
                          <p className="text-sm text-muted-foreground">
                            {definition.isScheduled
                              ? `Scheduled ${definition.cronExpression ?? "configured"}`
                              : "Manual only"}
                            {latestExecution ? ` | latest ${latestExecution.status}` : " | not yet run"}
                          </p>
                        </div>
                      </div>
                      <form action={triggerReportExecutionAction} className="mt-4 space-y-3">
                        <input name="definitionId" type="hidden" value={definition.id} />
                        <label className="space-y-2 text-sm font-medium text-foreground">
                          <span>Parameters JSON</span>
                          <Textarea name="parametersJson" rows={4} />
                        </label>
                        <Button type="submit" variant="outline">
                          Run now
                        </Button>
                      </form>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-border/60 bg-white/90 shadow-sm">
          <CardHeader>
            <CardTitle className="font-heading text-2xl">Create definition</CardTitle>
            <CardDescription>Register a new reusable report and delivery profile.</CardDescription>
          </CardHeader>
          <CardContent>
            <form action={createReportDefinitionAction} className="grid gap-4">
              <label className="space-y-2 text-sm font-medium text-foreground">
                <span>Name</span>
                <Input name="name" required />
              </label>
              <label className="space-y-2 text-sm font-medium text-foreground">
                <span>Description</span>
                <Textarea name="description" rows={3} />
              </label>
              <label className="space-y-2 text-sm font-medium text-foreground">
                <span>Report type</span>
                <select className="flex h-12 w-full rounded-2xl border border-border/70 bg-white/70 px-4 py-3 text-sm text-foreground shadow-sm outline-none focus-visible:border-ring focus-visible:ring-4 focus-visible:ring-ring/15" defaultValue="incident_statistical" name="reportType">
                  <option value="incident_statistical">incident_statistical</option>
                  <option value="cross_domain">cross_domain</option>
                  <option value="risk_forecast_summary">risk_forecast_summary</option>
                  <option value="resource_utilisation">resource_utilisation</option>
                  <option value="response_time_analysis">response_time_analysis</option>
                  <option value="custom">custom</option>
                </select>
              </label>
              <label className="space-y-2 text-sm font-medium text-foreground">
                <span>Default format</span>
                <select className="flex h-12 w-full rounded-2xl border border-border/70 bg-white/70 px-4 py-3 text-sm text-foreground shadow-sm outline-none focus-visible:border-ring focus-visible:ring-4 focus-visible:ring-ring/15" defaultValue="json" name="defaultFormat">
                  <option value="json">json</option>
                  <option value="pdf">pdf</option>
                  <option value="csv">csv</option>
                  <option value="xlsx">xlsx</option>
                </select>
              </label>
              <label className="space-y-2 text-sm font-medium text-foreground">
                <span>Classification</span>
                <Input defaultValue="1" max="3" min="0" name="classification" type="number" />
              </label>
              <label className="flex items-center gap-3 rounded-2xl border border-border/70 bg-muted/40 px-4 py-3 text-sm font-medium text-foreground">
                <input className="size-4 accent-[var(--primary)]" name="isScheduled" type="checkbox" value="true" />
                <span>Scheduled report</span>
              </label>
              <label className="space-y-2 text-sm font-medium text-foreground">
                <span>Cron expression</span>
                <Input name="cronExpression" placeholder="0 6 * * *" />
              </label>
              <label className="space-y-2 text-sm font-medium text-foreground">
                <span>Delivery channel</span>
                <select className="flex h-12 w-full rounded-2xl border border-border/70 bg-white/70 px-4 py-3 text-sm text-foreground shadow-sm outline-none focus-visible:border-ring focus-visible:ring-4 focus-visible:ring-ring/15" defaultValue="download" name="deliveryChannel">
                  <option value="download">download</option>
                  <option value="email">email</option>
                  <option value="webhook">webhook</option>
                </select>
              </label>
              <label className="space-y-2 text-sm font-medium text-foreground">
                <span>Query spec JSON</span>
                <Textarea
                  defaultValue={`{
  "dateFrom": "2026-01-01T00:00:00.000Z",
  "dateTo": "2026-04-08T00:00:00.000Z",
  "groupBy": "type"
}`}
                  name="querySpecJson"
                  rows={8}
                />
              </label>
              <label className="space-y-2 text-sm font-medium text-foreground">
                <span>Delivery config JSON</span>
                <Textarea defaultValue="{}" name="deliveryConfigJson" rows={4} />
              </label>
              <Button type="submit">Create definition</Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
