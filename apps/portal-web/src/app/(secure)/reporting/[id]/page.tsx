import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { triggerReportExecutionAction } from "../actions";
import { getReportDefinition, listReportExecutions } from "@/lib/reporting";

type ReportDefinitionDetailPageProps = {
  params: Promise<{
    id: string;
  }>;
};

export default async function ReportDefinitionDetailPage({
  params,
}: ReportDefinitionDetailPageProps) {
  const { id } = await params;
  const [definition, executions] = await Promise.all([
    getReportDefinition(id),
    listReportExecutions(id, 25),
  ]);

  return (
    <div className="space-y-6">
      <Card className="border-border/60 bg-white/90 shadow-sm">
        <CardHeader className="gap-4">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">{definition.reportType}</Badge>
            <Badge variant="secondary">{definition.defaultFormat}</Badge>
            <Badge variant="secondary">{definition.deliveryChannel}</Badge>
          </div>
          <div className="space-y-1">
            <CardTitle className="font-heading text-3xl">{definition.name}</CardTitle>
            <CardDescription>
              {definition.description ?? "No description"}
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-2xl border border-border/70 bg-muted/30 p-4">
            <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Classification</p>
            <p className="mt-2 text-sm font-medium text-foreground">{definition.classification}</p>
          </div>
          <div className="rounded-2xl border border-border/70 bg-muted/30 p-4">
            <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Owner</p>
            <p className="mt-2 text-sm font-medium text-foreground">{definition.ownerId}</p>
          </div>
          <div className="rounded-2xl border border-border/70 bg-muted/30 p-4">
            <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Scheduling</p>
            <p className="mt-2 text-sm font-medium text-foreground">
              {definition.isScheduled ? definition.cronExpression ?? "configured" : "manual only"}
            </p>
          </div>
          <div className="rounded-2xl border border-border/70 bg-muted/30 p-4">
            <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Execution mode</p>
            <p className="mt-2 text-sm font-medium text-foreground">
              {definition.isScheduled ? "Scheduled" : "On demand"}
            </p>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
        <Card className="border-border/60 bg-white/90 shadow-sm">
          <CardHeader>
            <CardTitle className="font-heading text-2xl">Query spec</CardTitle>
            <CardDescription>Structured definition used by the reporting engine.</CardDescription>
          </CardHeader>
          <CardContent>
            <pre className="overflow-x-auto rounded-3xl border border-border/70 bg-slate-950 p-4 text-xs text-slate-100">
              {JSON.stringify(definition.querySpec, null, 2)}
            </pre>
          </CardContent>
        </Card>

        <Card className="border-border/60 bg-white/90 shadow-sm">
          <CardHeader>
            <CardTitle className="font-heading text-2xl">Run definition</CardTitle>
            <CardDescription>Trigger a manual execution with custom parameters.</CardDescription>
          </CardHeader>
          <CardContent>
            <form action={triggerReportExecutionAction} className="space-y-4">
              <input name="definitionId" type="hidden" value={definition.id} />
              <label className="space-y-2 text-sm font-medium text-foreground">
                <span>Parameters JSON</span>
                <Textarea defaultValue="{}" name="parametersJson" rows={8} />
              </label>
              <Button type="submit">Trigger execution</Button>
            </form>
          </CardContent>
        </Card>
      </div>

      <Card className="border-border/60 bg-white/90 shadow-sm">
        <CardHeader>
          <CardTitle className="font-heading text-2xl">Executions</CardTitle>
          <CardDescription>Recent runs and their inline output where available.</CardDescription>
        </CardHeader>
        <CardContent>
          {executions.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border/70 bg-muted/30 px-4 py-8 text-sm text-muted-foreground">
              No executions for this definition yet.
            </div>
          ) : (
            <div className="space-y-4">
              {executions.map((execution) => (
                <div key={execution.id} className="rounded-3xl border border-border/70 bg-background/80 p-5">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline">{execution.status}</Badge>
                    <Badge variant="secondary">{execution.triggerSource}</Badge>
                    <Badge variant="secondary">{execution.format}</Badge>
                  </div>
                  <p className="mt-3 text-sm text-muted-foreground">
                    Rows {execution.rowCount ?? 0} | started {execution.startedAt ?? "n/a"} |
                    completed {execution.completedAt ?? "n/a"}
                  </p>
                  {execution.errorMessage ? (
                    <p className="mt-3 text-sm text-destructive">Error: {execution.errorMessage}</p>
                  ) : null}
                  {execution.inlineResult ? (
                    <pre className="mt-4 overflow-x-auto rounded-3xl border border-border/70 bg-slate-950 p-4 text-xs text-slate-100">
                      {JSON.stringify(execution.inlineResult, null, 2)}
                    </pre>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
