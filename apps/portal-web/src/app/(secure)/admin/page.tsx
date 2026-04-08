import Link from "next/link";
import {
  deriveAdminOperationsAlerts,
  getAdminDashboardSummary,
  getAdminOperationsSnapshot,
  isSearchReady,
} from "@/lib/admin";

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

  return (
    <div className="portal-stack">
      <section className="portal-panel">
        <div className="portal-section-head">
          <div>
            <span className="portal-pill">Administration</span>
            <h2>Platform control plane</h2>
          </div>
          <Link className="portal-button secondary" href="/search">
            Open search
          </Link>
        </div>
        <div className="portal-kpis">
          <div className="portal-kpi">
            Users
            <strong>{summary.kpis.users}</strong>
          </div>
          <div className="portal-kpi">
            Departments
            <strong>{summary.kpis.departments}</strong>
          </div>
          <div className="portal-kpi">
            Positions
            <strong>{summary.kpis.positions}</strong>
          </div>
          <div className="portal-kpi">
            Roles
            <strong>{summary.kpis.roles}</strong>
          </div>
          <div className="portal-kpi">
            Backend
            <strong>{operations.backend.status}</strong>
          </div>
          <div className="portal-kpi">
            Search
            <strong>{searchReady ? "ready" : "degraded"}</strong>
          </div>
          <div className="portal-kpi">
            Live calls
            <strong>{operations.calls.kpis.activeSessions}</strong>
          </div>
          <div className="portal-kpi">
            Jobs healthy
            <strong>{jobsHealthyCount}/3</strong>
          </div>
          <div className="portal-kpi">
            Critical alerts
            <strong>{criticalAlerts}</strong>
          </div>
          <div className="portal-kpi">
            Outbox dead-letter
            <strong>{operations.reliability.outbox.counts.deadLetter}</strong>
          </div>
          <div className="portal-kpi">
            Inbox failed
            <strong>{operations.reliability.inbox.counts.failed}</strong>
          </div>
        </div>
      </section>

      <section className="portal-panel">
        <div className="portal-section-head">
          <h2>Attention now</h2>
          <Link className="portal-button secondary" href="/admin/system">
            Open operations
          </Link>
        </div>
        {alerts.length === 0 ? (
          <p className="portal-note">No active operational alerts. Core services and jobs report healthy state.</p>
        ) : (
          <ul className="portal-list">
            {alerts.slice(0, 5).map((alert) => (
              <li key={alert.id} className={`portal-alert portal-alert-${alert.severity}`}>
                <div className="portal-row">
                  <div>
                    <strong>{alert.title}</strong>
                    <p className="portal-note">{alert.detail}</p>
                  </div>
                  <Link className="portal-button secondary" href={alert.href}>
                    Inspect
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="portal-columns">
        <article className="portal-panel">
          <div className="portal-section-head">
            <h2>Modules</h2>
          </div>
          <ul className="portal-list">
            <li><Link className="portal-item-link" href="/admin/users">Users</Link></li>
            <li><Link className="portal-item-link" href="/admin/departments">Departments</Link></li>
            <li><Link className="portal-item-link" href="/admin/positions">Positions</Link></li>
            <li><Link className="portal-item-link" href="/admin/roles">Roles</Link></li>
            <li><Link className="portal-item-link" href="/admin/system">Operations monitoring</Link></li>
            <li><Link className="portal-item-link" href="/admin/logs">Audit logs</Link></li>
          </ul>
        </article>

        <article className="portal-panel">
          <div className="portal-section-head">
            <h2>Operations snapshot</h2>
            <Link className="portal-button secondary" href="/admin/system">
              Open system view
            </Link>
          </div>
          <div className="portal-kpis">
            <div className="portal-kpi">
              Gateway
              <strong>{operations.gateway.configured ? "configured" : "offline"}</strong>
            </div>
            <div className="portal-kpi">
              Event bus
              <strong>{operations.gateway.eventBusConfigured ? "connected" : "degraded"}</strong>
            </div>
            <div className="portal-kpi">
              Media plane
              <strong>{operations.calls.media.reachable ? "reachable" : "unreachable"}</strong>
            </div>
            <div className="portal-kpi">
              Recordings failed
              <strong>{operations.calls.recordings.failed}</strong>
            </div>
            <div className="portal-kpi">
              Retention
              <strong>{operations.calls.retention.error ? "attention" : "ok"}</strong>
            </div>
            <div className="portal-kpi">
              Uptime
              <strong>{operations.backend.uptimeSeconds}s</strong>
            </div>
          </div>
          <ul className="portal-list">
            <li>
              <strong>Backend:</strong> {operations.backend.status} | {operations.backend.service} | sample {operations.backend.timestamp}
            </li>
            <li>
              <strong>Search:</strong> {searchReady ? "ready" : "degraded"}
            </li>
            <li>
              <strong>Calls:</strong> {operations.calls.kpis.activeSessions} active, {operations.calls.kpis.joinedParticipants} participants, {operations.calls.recordings.processing} recordings processing
            </li>
            <li>
              <strong>Retention:</strong> last run {operations.calls.retention.ranAt ?? "never"} | deleted {operations.calls.retention.deletedCount}
            </li>
            <li>
              <strong>Reliability:</strong> outbox failed {operations.reliability.outbox.counts.failed}, dead-letter {operations.reliability.outbox.counts.deadLetter}, inbox failed {operations.reliability.inbox.counts.failed}
            </li>
          </ul>
        </article>

        <article className="portal-panel">
          <div className="portal-section-head">
            <h2>Scheduler and reliability</h2>
          </div>
          <ul className="portal-list">
            <li>
              <strong>Outbox:</strong> pending {operations.reliability.outbox.counts.pending}, retryable {operations.reliability.outbox.retryableCount}, next retry {operations.reliability.outbox.nextRetryAt ?? "none"}
            </li>
            <li>
              <strong>Inbox:</strong> consumers {operations.reliability.inbox.consumerCount}, processing {operations.reliability.inbox.counts.processing}, stale {operations.reliability.inbox.staleProcessingCount}
            </li>
            <li>
              <strong>Analytics:</strong> {formatJobStatus(operations.jobs.analytics)}
            </li>
            <li>
              <strong>Reporting:</strong> {formatJobStatus(operations.jobs.reporting)}
            </li>
            <li>
              <strong>Audit export:</strong> {formatJobStatus(operations.jobs.audit)}
            </li>
          </ul>
        </article>
      </section>

      <section className="portal-panel">
        <div className="portal-section-head">
          <h2>Recent audit trail</h2>
          <Link className="portal-button secondary" href="/admin/logs">
            Open logs
          </Link>
        </div>
        <ul className="portal-list">
          {summary.recentAudit.length === 0 ? (
            <li>No audit events available.</li>
          ) : (
            summary.recentAudit.map((event) => (
              <li key={event.id}>
                <div className="portal-row">
                  <div>
                    <strong>{event.eventType}</strong>
                    <p className="portal-note">
                      {event.actorUsername ?? event.actorId ?? "system"} | {event.severity} | {event.occurredAt}
                    </p>
                  </div>
                  <span className="portal-pill">{event.success ? "success" : "failed"}</span>
                </div>
              </li>
            ))
          )}
        </ul>
      </section>
    </div>
  );
}
