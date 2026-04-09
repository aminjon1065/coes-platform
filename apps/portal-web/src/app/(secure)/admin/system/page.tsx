import { deriveAdminOperationsAlerts, getAdminOperationsSnapshot, isSearchReady } from "@/lib/admin";
import {
  markOutboxDeadLetterAction,
  replayOutboxEventAction,
  resetInboxMessageAction,
  retryInboxMessageAction,
  triggerSearchReindexAction,
} from "../actions";
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

function formatJobState(summary: Record<string, unknown>) {
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

function alertVariant(severity: "critical" | "warning" | "info") {
  if (severity === "critical") return "destructive" as const;
  if (severity === "warning") return "outline" as const;
  return "secondary" as const;
}

export default async function AdminSystemPage() {
  const operations = await getAdminOperationsSnapshot();
  const alerts = deriveAdminOperationsAlerts(operations);
  const searchReady = isSearchReady(operations.search);

  const topCards = [
    { label: "Backend status", value: operations.backend.status },
    { label: "Uptime", value: `${operations.backend.uptimeSeconds}s` },
    {
      label: "Search health",
      value: searchReady ? "ready" : String(operations.search.status ?? "unknown"),
    },
    { label: "Active calls", value: operations.calls.kpis.activeSessions },
    {
      label: "Realtime gateway",
      value: operations.gateway.configured ? "configured" : "missing",
    },
    { label: "Outbox dead-letter", value: operations.reliability.outbox.counts.deadLetter },
    { label: "Inbox failed", value: operations.reliability.inbox.counts.failed },
  ];

  const reliabilityCards = [
    { label: "Outbox pending", value: operations.reliability.outbox.counts.pending },
    { label: "Outbox failed", value: operations.reliability.outbox.counts.failed },
    { label: "Dead-letter", value: operations.reliability.outbox.counts.deadLetter },
    { label: "Inbox processing", value: operations.reliability.inbox.counts.processing },
    { label: "Inbox failed", value: operations.reliability.inbox.counts.failed },
    { label: "Stale processing", value: operations.reliability.inbox.staleProcessingCount },
  ];

  const callsCards = [
    { label: "Active sessions", value: operations.calls.kpis.activeSessions },
    { label: "Joined participants", value: operations.calls.kpis.joinedParticipants },
    { label: "Ready recordings", value: operations.calls.recordings.ready },
    { label: "Expiring soon", value: operations.calls.recordings.expiringSoon },
    { label: "Retention deleted", value: operations.calls.retention.deletedCount },
  ];

  return (
    <div className="space-y-6">
      <section className="grid gap-4 xl:grid-cols-[1.05fr_0.95fr]">
        <Card className="overflow-hidden border-white/70 bg-[linear-gradient(135deg,rgba(255,255,255,0.96),rgba(232,242,252,0.88))]">
          <CardHeader className="space-y-4">
            <Badge className="w-fit">System</Badge>
            <div className="space-y-3">
              <CardTitle className="font-display text-4xl leading-tight">
                Monitoring and maintenance
              </CardTitle>
              <CardDescription className="max-w-2xl text-base">
                Consolidated runtime, reliability, call-plane, and search maintenance surface.
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {topCards.map((card) => (
              <Card className="border-border/70 shadow-none" key={card.label}>
                <CardContent className="space-y-2 p-5">
                  <p className="text-sm text-muted-foreground">{card.label}</p>
                  <p className="font-display text-3xl">{card.value}</p>
                </CardContent>
              </Card>
            ))}
          </CardContent>
        </Card>

        <Card className="border-white/70 bg-[linear-gradient(180deg,rgba(13,27,47,0.94),rgba(19,46,78,0.9))] text-white">
          <CardHeader>
            <CardDescription className="text-white/60">Attention and thresholds</CardDescription>
            <CardTitle className="font-display text-3xl text-white">
              {alerts.length === 0 ? "No breaches" : `${alerts.length} flagged conditions`}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {alerts.length === 0 ? (
              <p className="text-sm leading-6 text-white/70">
                No threshold breaches detected across backend, gateway, search, calls,
                retention, and jobs.
              </p>
            ) : (
              alerts.map((alert) => (
                <div className="rounded-2xl border border-white/10 bg-white/6 p-4" key={alert.id}>
                  <div className="space-y-2">
                    <Badge variant={alertVariant(alert.severity)}>{alert.severity}</Badge>
                    <p className="font-medium text-white">{alert.title}</p>
                    <p className="text-sm leading-6 text-white/70">{alert.detail}</p>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="font-display text-2xl">Runtime health</CardTitle>
            <CardDescription>Backend, gateway, and search status overview.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3">
            <div className="rounded-3xl border border-border/70 bg-white/70 p-4 text-sm text-muted-foreground">
              <strong className="text-foreground">Status:</strong> {operations.backend.status}
            </div>
            <div className="rounded-3xl border border-border/70 bg-white/70 p-4 text-sm text-muted-foreground">
              <strong className="text-foreground">Service:</strong> {operations.backend.service}
            </div>
            <div className="rounded-3xl border border-border/70 bg-white/70 p-4 text-sm text-muted-foreground">
              <strong className="text-foreground">Sample time:</strong> {operations.backend.timestamp}
            </div>
            <div className="rounded-3xl border border-border/70 bg-white/70 p-4 text-sm text-muted-foreground">
              <strong className="text-foreground">Gateway:</strong> {operations.gateway.configured ? "configured" : "missing"} · {operations.gateway.wsUrl || "not configured"}
            </div>
            <div className="rounded-3xl border border-border/70 bg-white/70 p-4 text-sm text-muted-foreground">
              <strong className="text-foreground">Event bus:</strong> {operations.gateway.eventBusConfigured ? "configured" : "degraded"}
            </div>
            <div className="rounded-3xl border border-border/70 bg-white/70 p-4 text-sm text-muted-foreground">
              <strong className="text-foreground">Search:</strong> {searchReady ? "ready" : "degraded"}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="font-display text-2xl">Reliability</CardTitle>
            <CardDescription>Outbox and inbox health across backlog and consumers.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {reliabilityCards.map((card) => (
              <Card className="border-border/70 shadow-none" key={card.label}>
                <CardContent className="space-y-2 p-5">
                  <p className="text-sm text-muted-foreground">{card.label}</p>
                  <p className="font-display text-3xl">{card.value}</p>
                </CardContent>
              </Card>
            ))}
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="font-display text-2xl">Outbox backlog</CardTitle>
            <CardDescription>Pending, failed, and dead-letter dispatch events.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {operations.reliability.outboxBacklog.length === 0 ? (
              <p className="rounded-2xl border border-dashed border-border bg-background/70 p-4 text-sm text-muted-foreground">
                No pending, failed, or dead-letter outbox events.
              </p>
            ) : (
              <ul className="space-y-3">
                {operations.reliability.outboxBacklog.map((item) => (
                  <li className="rounded-3xl border border-border/70 bg-white/70 p-4" key={item.id}>
                    <div className="space-y-2">
                      <p className="font-semibold text-foreground">{item.eventType}</p>
                      <p className="text-sm text-muted-foreground">
                        {item.status} | {item.source ?? "unknown source"} | attempts {item.attempts}/{item.maxAttempts} | next {item.availableAt}
                      </p>
                      {item.lastError ? <p className="text-sm text-muted-foreground">{item.lastError}</p> : null}
                    </div>
                  </li>
                ))}
              </ul>
            )}
            {operations.reliability.outbox.latestFailure?.id ? (
              <div className="space-y-3 rounded-3xl border border-border/70 bg-background/70 p-4">
                <p className="text-sm text-muted-foreground">
                  Latest failure {operations.reliability.outbox.latestFailure.eventType} |{" "}
                  {operations.reliability.outbox.latestFailure.source ?? "unknown source"} |{" "}
                  {operations.reliability.outbox.latestFailure.updatedAt}
                </p>
                {operations.reliability.outbox.latestFailure.lastError ? (
                  <p className="text-sm text-muted-foreground">
                    {operations.reliability.outbox.latestFailure.lastError}
                  </p>
                ) : null}
                <div className="flex flex-wrap gap-3">
                  <form action={replayOutboxEventAction}>
                    <input name="eventId" type="hidden" value={operations.reliability.outbox.latestFailure.id} />
                    <Button type="submit">Replay latest failure</Button>
                  </form>
                  <form action={markOutboxDeadLetterAction}>
                    <input name="eventId" type="hidden" value={operations.reliability.outbox.latestFailure.id} />
                    <Button type="submit" variant="secondary">
                      Force dead-letter
                    </Button>
                  </form>
                </div>
              </div>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="font-display text-2xl">Inbox backlog</CardTitle>
            <CardDescription>Failed and stale inbox consumer messages.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {operations.reliability.inboxBacklog.length === 0 ? (
              <p className="rounded-2xl border border-dashed border-border bg-background/70 p-4 text-sm text-muted-foreground">
                No failed or stale inbox consumer messages.
              </p>
            ) : (
              <ul className="space-y-3">
                {operations.reliability.inboxBacklog.map((item) => (
                  <li className="rounded-3xl border border-border/70 bg-white/70 p-4" key={item.id}>
                    <div className="space-y-2">
                      <p className="font-semibold text-foreground">{item.consumer}</p>
                      <p className="text-sm text-muted-foreground">
                        {item.eventType} | {item.status} | attempts {item.attempts} | updated {item.updatedAt}
                      </p>
                      {item.lastError ? <p className="text-sm text-muted-foreground">{item.lastError}</p> : null}
                    </div>
                  </li>
                ))}
              </ul>
            )}
            {operations.reliability.inbox.latestFailure?.id ? (
              <div className="space-y-3 rounded-3xl border border-border/70 bg-background/70 p-4">
                <p className="text-sm text-muted-foreground">
                  Latest failure {operations.reliability.inbox.latestFailure.consumer} |{" "}
                  {operations.reliability.inbox.latestFailure.eventType} |{" "}
                  {operations.reliability.inbox.latestFailure.updatedAt}
                </p>
                {operations.reliability.inbox.latestFailure.lastError ? (
                  <p className="text-sm text-muted-foreground">
                    {operations.reliability.inbox.latestFailure.lastError}
                  </p>
                ) : null}
                <div className="flex flex-wrap gap-3">
                  <form action={retryInboxMessageAction}>
                    <input name="messageId" type="hidden" value={operations.reliability.inbox.latestFailure.id} />
                    <Button type="submit">Retry latest failure</Button>
                  </form>
                  <form action={resetInboxMessageAction}>
                    <input name="messageId" type="hidden" value={operations.reliability.inbox.latestFailure.id} />
                    <Button type="submit" variant="secondary">
                      Reset message
                    </Button>
                  </form>
                </div>
              </div>
            ) : null}
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1fr_0.85fr]">
        <Card>
          <CardHeader>
            <Badge className="w-fit">Calls</Badge>
            <CardTitle className="font-display text-2xl">Calls and media operations</CardTitle>
            <CardDescription>Runtime, recording lifecycle, media reachability, and retention.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
              {callsCards.map((card) => (
                <Card className="border-border/70 shadow-none" key={card.label}>
                  <CardContent className="space-y-2 p-5">
                    <p className="text-sm text-muted-foreground">{card.label}</p>
                    <p className="font-display text-3xl">{card.value}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
            <div className="grid gap-4 xl:grid-cols-2">
              <div className="rounded-3xl border border-border/70 bg-white/70 p-4 text-sm text-muted-foreground">
                total sessions {operations.calls.kpis.totalSessions} | upcoming schedules {operations.calls.kpis.upcomingSchedules}
                <br />
                recordings: live {operations.calls.recordings.recording}, processing {operations.calls.recordings.processing}, failed {operations.calls.recordings.failed}, deleted {operations.calls.recordings.deleted}
              </div>
              <div className="rounded-3xl border border-border/70 bg-white/70 p-4 text-sm text-muted-foreground">
                {operations.calls.media.reachable
                  ? `${operations.calls.media.status} | active sessions ${operations.calls.media.activeSessions ?? "n/a"}`
                  : "media service unreachable"}
                {operations.calls.media.error ? ` | ${operations.calls.media.error}` : ""}
              </div>
            </div>
            <pre className="overflow-auto rounded-3xl bg-slate-950 p-4 text-xs text-slate-100">
              {JSON.stringify(operations.calls.media.raw ?? operations.calls.media, null, 2)}
            </pre>
            <div className="rounded-3xl border border-border/70 bg-background/70 p-4 text-sm text-muted-foreground">
              last run {operations.calls.retention.ranAt ?? "not yet"} | deleted {operations.calls.retention.deletedCount}
              <br />
              {operations.calls.retention.error ?? "last retention run completed without reported errors"}
            </div>
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="font-display text-2xl">Scheduled jobs</CardTitle>
              <CardDescription>Analytics, reporting, and audit export status.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3">
              <div className="rounded-3xl border border-border/70 bg-white/70 p-4 text-sm text-muted-foreground">
                <strong className="text-foreground">Analytics:</strong> {formatJobState(operations.jobs.analytics)}
              </div>
              <div className="rounded-3xl border border-border/70 bg-white/70 p-4 text-sm text-muted-foreground">
                <strong className="text-foreground">Reporting:</strong> {formatJobState(operations.jobs.reporting)}
              </div>
              <div className="rounded-3xl border border-border/70 bg-white/70 p-4 text-sm text-muted-foreground">
                <strong className="text-foreground">Audit export:</strong> {formatJobState(operations.jobs.audit)}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="font-display text-2xl">Maintenance actions</CardTitle>
              <CardDescription>Trigger search reindex from the portal control plane.</CardDescription>
            </CardHeader>
            <CardContent>
              <form action={triggerSearchReindexAction} className="grid gap-4">
                <div className="grid gap-3 rounded-3xl border border-border/70 bg-background/70 p-4">
                  <p className="text-sm font-medium text-foreground">Indices</p>
                  <div className="grid gap-3">
                    <label className="flex items-center gap-3 text-sm text-foreground">
                      <input className="size-4 accent-[var(--primary)]" defaultChecked name="indices" type="checkbox" value="documents" />
                      <span>documents</span>
                    </label>
                    <label className="flex items-center gap-3 text-sm text-foreground">
                      <input className="size-4 accent-[var(--primary)]" defaultChecked name="indices" type="checkbox" value="tasks" />
                      <span>tasks</span>
                    </label>
                    <label className="flex items-center gap-3 text-sm text-foreground">
                      <input className="size-4 accent-[var(--primary)]" defaultChecked name="indices" type="checkbox" value="messages" />
                      <span>messages</span>
                    </label>
                  </div>
                  <label className="grid gap-2 text-sm font-medium text-foreground">
                    Batch size
                    <Input defaultValue="250" min="10" name="batchSize" type="number" />
                  </label>
                  <div className="grid gap-3">
                    <label className="flex items-center gap-3 text-sm text-foreground">
                      <input className="size-4 accent-[var(--primary)]" defaultChecked name="ensureIndices" type="checkbox" />
                      <span>Ensure indices</span>
                    </label>
                    <label className="flex items-center gap-3 text-sm text-foreground">
                      <input className="size-4 accent-[var(--primary)]" defaultChecked name="refresh" type="checkbox" />
                      <span>Refresh after reindex</span>
                    </label>
                  </div>
                </div>
                <Button className="w-fit" type="submit">
                  Run reindex
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>
      </section>
    </div>
  );
}
