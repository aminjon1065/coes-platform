import Link from "next/link";
import {
  deriveAdminOperationsAlerts,
  getAdminDashboardSummary,
  getAdminOperationsSnapshot,
  isSearchReady,
} from "@/lib/admin";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

function formatJobStatus(summary: Record<string, unknown>) {
  const ranAt =
    typeof summary.ranAt === "string" && summary.ranAt.trim()
      ? summary.ranAt
      : "never";
  const error =
    typeof summary.error === "string" && summary.error.trim()
      ? summary.error
      : null;

  return error ? `failed | ${ranAt}` : `ok | ${ranAt}`;
}

function getAlertVariant(severity: "critical" | "warning" | "info") {
  if (severity === "critical") return "destructive" as const;
  if (severity === "warning") return "outline" as const;
  return "secondary" as const;
}

export default async function AdminHomePage() {
  const [summary, operations] = await Promise.all([
    getAdminDashboardSummary(),
    getAdminOperationsSnapshot(),
  ]);
  const alerts = deriveAdminOperationsAlerts(operations);
  const searchReady = isSearchReady(operations.search);
  const jobsHealthyCount = [
    operations.jobs.analytics,
    operations.jobs.reporting,
    operations.jobs.audit,
  ].filter((job) => !job.error).length;
  const criticalAlerts = alerts.filter((alert) => alert.severity === "critical").length;

  const kpiCards = [
    { label: "Users", value: summary.kpis.users },
    { label: "Departments", value: summary.kpis.departments },
    { label: "Positions", value: summary.kpis.positions },
    { label: "Roles", value: summary.kpis.roles },
    { label: "Backend", value: operations.backend.status },
    { label: "Search", value: searchReady ? "ready" : "degraded" },
    { label: "Live calls", value: operations.calls.kpis.activeSessions },
    { label: "Jobs healthy", value: `${jobsHealthyCount}/3` },
    { label: "Critical alerts", value: criticalAlerts },
    {
      label: "Outbox dead-letter",
      value: operations.reliability.outbox.counts.deadLetter,
    },
    { label: "Inbox failed", value: operations.reliability.inbox.counts.failed },
  ];

  const moduleLinks = [
    { href: "/admin/users", label: "Users", detail: "Provision and offboard accounts." },
    {
      href: "/admin/departments",
      label: "Departments",
      detail: "Inspect org hierarchy and capacity.",
    },
    {
      href: "/admin/positions",
      label: "Positions",
      detail: "Manage assignment-capable positions.",
    },
    { href: "/admin/roles", label: "Roles", detail: "Control capability bundles." },
    {
      href: "/admin/system",
      label: "Operations monitoring",
      detail: "Health, queues, jobs, and media plane.",
    },
    { href: "/admin/logs", label: "Audit logs", detail: "Review platform events." },
  ];

  const operationsSnapshotCards = [
    { label: "Gateway", value: operations.gateway.configured ? "configured" : "offline" },
    {
      label: "Event bus",
      value: operations.gateway.eventBusConfigured ? "connected" : "degraded",
    },
    {
      label: "Media plane",
      value: operations.calls.media.reachable ? "reachable" : "unreachable",
    },
    { label: "Recordings failed", value: operations.calls.recordings.failed },
    {
      label: "Retention",
      value: operations.calls.retention.error ? "attention" : "ok",
    },
    { label: "Uptime", value: `${operations.backend.uptimeSeconds}s` },
  ];

  return (
    <div className="space-y-6">
      <section className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <Card className="overflow-hidden border-white/70 bg-[linear-gradient(135deg,rgba(255,255,255,0.96),rgba(232,242,252,0.88))]">
          <CardHeader className="space-y-4">
            <Badge className="w-fit">Administration</Badge>
            <div className="space-y-3">
              <CardTitle className="font-display text-4xl leading-tight">
                Platform control plane
              </CardTitle>
              <CardDescription className="max-w-2xl text-base">
                Central operations surface for users, roles, search readiness, realtime,
                scheduler jobs, and delivery reliability.
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-3">
            <Button asChild>
              <Link href="/admin/system">Open operations</Link>
            </Button>
            <Button asChild variant="secondary">
              <Link href="/search">Open search</Link>
            </Button>
          </CardContent>
        </Card>

        <Card className="border-white/70 bg-[linear-gradient(180deg,rgba(13,27,47,0.94),rgba(19,46,78,0.9))] text-white">
          <CardHeader>
            <CardDescription className="text-white/60">Attention now</CardDescription>
            <CardTitle className="font-display text-3xl text-white">
              {alerts.length === 0 ? "Stable state" : `${alerts.length} active alerts`}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {alerts.length === 0 ? (
              <p className="text-sm leading-6 text-white/70">
                No active operational alerts. Core services and background jobs are
                currently reporting healthy state.
              </p>
            ) : (
              alerts.slice(0, 3).map((alert) => (
                <div
                  className="rounded-2xl border border-white/10 bg-white/6 p-4"
                  key={alert.id}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-2">
                      <Badge variant={getAlertVariant(alert.severity)}>{alert.severity}</Badge>
                      <p className="font-medium text-white">{alert.title}</p>
                      <p className="text-sm leading-6 text-white/70">{alert.detail}</p>
                    </div>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {kpiCards.map((card) => (
          <Card className="h-full border-white/70" key={card.label}>
            <CardContent className="space-y-3 p-6">
              <p className="text-sm text-muted-foreground">{card.label}</p>
              <p className="font-display text-4xl text-foreground">{card.value}</p>
            </CardContent>
          </Card>
        ))}
      </section>

      <section className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
        <Card>
          <CardHeader>
            <CardTitle className="font-display text-2xl">Modules</CardTitle>
            <CardDescription>Primary admin entry points inside the portal.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3">
            {moduleLinks.map((item) => (
              <Link href={item.href} key={item.href}>
                <Card className="border-border/70 shadow-none transition-transform duration-150 hover:-translate-y-1">
                  <CardContent className="space-y-2 p-5">
                    <p className="font-semibold text-foreground">{item.label}</p>
                    <p className="text-sm leading-6 text-muted-foreground">{item.detail}</p>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-start justify-between gap-4">
            <div>
              <CardTitle className="font-display text-2xl">Operations snapshot</CardTitle>
              <CardDescription>
                Service connectivity, media health, queue pressure, and uptime summary.
              </CardDescription>
            </div>
            <Button asChild size="sm" variant="secondary">
              <Link href="/admin/system">Open system view</Link>
            </Button>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {operationsSnapshotCards.map((card) => (
                <Card className="border-border/70 shadow-none" key={card.label}>
                  <CardContent className="space-y-2 p-5">
                    <p className="text-sm text-muted-foreground">{card.label}</p>
                    <p className="font-display text-3xl">{card.value}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
            <div className="grid gap-3">
              <div className="rounded-3xl border border-border/70 bg-white/70 p-4 text-sm leading-6 text-muted-foreground">
                <strong className="text-foreground">Backend:</strong> {operations.backend.status} |{" "}
                {operations.backend.service} | sample {operations.backend.timestamp}
              </div>
              <div className="rounded-3xl border border-border/70 bg-white/70 p-4 text-sm leading-6 text-muted-foreground">
                <strong className="text-foreground">Search:</strong>{" "}
                {searchReady ? "ready" : "degraded"}
              </div>
              <div className="rounded-3xl border border-border/70 bg-white/70 p-4 text-sm leading-6 text-muted-foreground">
                <strong className="text-foreground">Calls:</strong>{" "}
                {operations.calls.kpis.activeSessions} active,{" "}
                {operations.calls.kpis.joinedParticipants} participants,{" "}
                {operations.calls.recordings.processing} recordings processing
              </div>
              <div className="rounded-3xl border border-border/70 bg-white/70 p-4 text-sm leading-6 text-muted-foreground">
                <strong className="text-foreground">Retention:</strong> last run{" "}
                {operations.calls.retention.ranAt ?? "never"} | deleted{" "}
                {operations.calls.retention.deletedCount}
              </div>
              <div className="rounded-3xl border border-border/70 bg-white/70 p-4 text-sm leading-6 text-muted-foreground">
                <strong className="text-foreground">Reliability:</strong> outbox failed{" "}
                {operations.reliability.outbox.counts.failed}, dead-letter{" "}
                {operations.reliability.outbox.counts.deadLetter}, inbox failed{" "}
                {operations.reliability.inbox.counts.failed}
              </div>
            </div>
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
        <Card>
          <CardHeader>
            <CardTitle className="font-display text-2xl">Scheduler and reliability</CardTitle>
            <CardDescription>
              Queue backlog, retries, consumers, and scheduled jobs.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3">
            <div className="rounded-3xl border border-border/70 bg-white/70 p-4 text-sm leading-6 text-muted-foreground">
              <strong className="text-foreground">Outbox:</strong> pending{" "}
              {operations.reliability.outbox.counts.pending}, retryable{" "}
              {operations.reliability.outbox.retryableCount}, next retry{" "}
              {operations.reliability.outbox.nextRetryAt ?? "none"}
            </div>
            <div className="rounded-3xl border border-border/70 bg-white/70 p-4 text-sm leading-6 text-muted-foreground">
              <strong className="text-foreground">Inbox:</strong> consumers{" "}
              {operations.reliability.inbox.consumerCount}, processing{" "}
              {operations.reliability.inbox.counts.processing}, stale{" "}
              {operations.reliability.inbox.staleProcessingCount}
            </div>
            <div className="rounded-3xl border border-border/70 bg-white/70 p-4 text-sm leading-6 text-muted-foreground">
              <strong className="text-foreground">Analytics:</strong>{" "}
              {formatJobStatus(operations.jobs.analytics)}
            </div>
            <div className="rounded-3xl border border-border/70 bg-white/70 p-4 text-sm leading-6 text-muted-foreground">
              <strong className="text-foreground">Reporting:</strong>{" "}
              {formatJobStatus(operations.jobs.reporting)}
            </div>
            <div className="rounded-3xl border border-border/70 bg-white/70 p-4 text-sm leading-6 text-muted-foreground">
              <strong className="text-foreground">Audit export:</strong>{" "}
              {formatJobStatus(operations.jobs.audit)}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-start justify-between gap-4">
            <div>
              <CardTitle className="font-display text-2xl">Recent audit trail</CardTitle>
              <CardDescription>
                Latest admin-relevant events surfaced from the audit stream.
              </CardDescription>
            </div>
            <Button asChild size="sm" variant="secondary">
              <Link href="/admin/logs">Open logs</Link>
            </Button>
          </CardHeader>
          <CardContent>
            <ul className="space-y-3">
              {summary.recentAudit.length === 0 ? (
                <li className="rounded-2xl border border-dashed border-border bg-background/70 p-4 text-sm text-muted-foreground">
                  No audit events available.
                </li>
              ) : (
                summary.recentAudit.map((event) => (
                  <li
                    className="flex flex-col gap-4 rounded-3xl border border-border/70 bg-white/70 p-4 md:flex-row md:items-start md:justify-between"
                    key={event.id}
                  >
                    <div className="space-y-2">
                      <p className="font-semibold text-foreground">{event.eventType}</p>
                      <p className="text-sm text-muted-foreground">
                        {event.actorUsername ?? event.actorId ?? "system"} | {event.severity} |{" "}
                        {event.occurredAt}
                      </p>
                    </div>
                    <Badge variant={event.success ? "secondary" : "destructive"}>
                      {event.success ? "success" : "failed"}
                    </Badge>
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
