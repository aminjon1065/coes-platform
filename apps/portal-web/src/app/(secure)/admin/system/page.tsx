import { deriveAdminOperationsAlerts, getAdminOperationsSnapshot, isSearchReady } from "@/lib/admin";
import {
  markOutboxDeadLetterAction,
  replayOutboxEventAction,
  resetInboxMessageAction,
  retryInboxMessageAction,
  triggerSearchReindexAction,
} from "../actions";

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

export default async function AdminSystemPage() {
  const operations = await getAdminOperationsSnapshot();
  const alerts = deriveAdminOperationsAlerts(operations);
  const searchReady = isSearchReady(operations.search);

  return (
    <div className="portal-stack">
      <section className="portal-panel">
        <div className="portal-section-head">
          <div>
            <span className="portal-pill">System</span>
            <h2>Monitoring and maintenance</h2>
          </div>
        </div>
        <div className="portal-kpis">
          <div className="portal-kpi">
            Backend status
            <strong>{operations.backend.status}</strong>
          </div>
          <div className="portal-kpi">
            Uptime
            <strong>{operations.backend.uptimeSeconds}s</strong>
          </div>
          <div className="portal-kpi">
            Search health
            <strong>{searchReady ? "ready" : String(operations.search.status ?? "unknown")}</strong>
          </div>
          <div className="portal-kpi">
            Active calls
            <strong>{operations.calls.kpis.activeSessions}</strong>
          </div>
          <div className="portal-kpi">
            Realtime gateway
            <strong>{operations.gateway.configured ? "configured" : "missing"}</strong>
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
          <h2>Attention and thresholds</h2>
        </div>
        {alerts.length === 0 ? (
          <p className="portal-note">No threshold breaches detected across backend, gateway, search, calls, retention, and jobs.</p>
        ) : (
          <ul className="portal-list">
            {alerts.map((alert) => (
              <li key={alert.id} className={`portal-alert portal-alert-${alert.severity}`}>
                <strong>{alert.title}</strong>
                <p className="portal-note">{alert.detail}</p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="portal-columns admin-split">
        <article className="portal-panel">
          <div className="portal-section-head">
            <h2>Runtime health</h2>
          </div>
          <ul className="portal-list">
            <li>
              <strong>Status:</strong> {operations.backend.status}
            </li>
            <li>
              <strong>Service:</strong> {operations.backend.service}
            </li>
            <li>
              <strong>Sample time:</strong> {operations.backend.timestamp}
            </li>
            <li>
              <strong>Uptime:</strong> {operations.backend.uptimeSeconds}s
            </li>
          </ul>
        </article>

        <article className="portal-panel">
          <div className="portal-section-head">
            <h2>Gateway and search</h2>
          </div>
          <ul className="portal-list">
            <li>
              <strong>Gateway:</strong> {operations.gateway.configured ? "configured" : "missing"}
            </li>
            <li>
              <strong>Gateway URL:</strong> {operations.gateway.wsUrl || "not configured"}
            </li>
            <li>
              <strong>Event bus:</strong> {operations.gateway.eventBusConfigured ? "configured" : "degraded"}
            </li>
            <li>
              <strong>Search:</strong> {searchReady ? "ready" : "degraded"}
            </li>
          </ul>
        </article>
      </section>

      <section className="portal-columns admin-split">
        <article className="portal-panel">
          <div className="portal-section-head">
            <h2>Outbox backlog</h2>
          </div>
          {operations.reliability.outboxBacklog.length === 0 ? (
            <p className="portal-note">No pending, failed, or dead-letter outbox events.</p>
          ) : (
            <ul className="portal-list">
              {operations.reliability.outboxBacklog.map((item) => (
                <li key={item.id}>
                  <strong>{item.eventType}</strong>
                  <p className="portal-note">
                    {item.status} | {item.source ?? "unknown source"} | attempts {item.attempts}/{item.maxAttempts} | next {item.availableAt}
                  </p>
                  {item.lastError ? <p className="portal-note">{item.lastError}</p> : null}
                </li>
              ))}
            </ul>
          )}
        </article>

        <article className="portal-panel">
          <div className="portal-section-head">
            <h2>Inbox backlog</h2>
          </div>
          {operations.reliability.inboxBacklog.length === 0 ? (
            <p className="portal-note">No failed or stale inbox consumer messages.</p>
          ) : (
            <ul className="portal-list">
              {operations.reliability.inboxBacklog.map((item) => (
                <li key={item.id}>
                  <strong>{item.consumer}</strong>
                  <p className="portal-note">
                    {item.eventType} | {item.status} | attempts {item.attempts} | updated {item.updatedAt}
                  </p>
                  {item.lastError ? <p className="portal-note">{item.lastError}</p> : null}
                </li>
              ))}
            </ul>
          )}
        </article>
      </section>

      <section className="portal-panel">
        <div className="portal-section-head">
          <div>
            <span className="portal-pill">Reliability</span>
            <h2>Outbox and inbox health</h2>
          </div>
        </div>
        <div className="portal-kpis">
          <div className="portal-kpi">
            Outbox pending
            <strong>{operations.reliability.outbox.counts.pending}</strong>
          </div>
          <div className="portal-kpi">
            Outbox failed
            <strong>{operations.reliability.outbox.counts.failed}</strong>
          </div>
          <div className="portal-kpi">
            Dead-letter
            <strong>{operations.reliability.outbox.counts.deadLetter}</strong>
          </div>
          <div className="portal-kpi">
            Inbox processing
            <strong>{operations.reliability.inbox.counts.processing}</strong>
          </div>
          <div className="portal-kpi">
            Inbox failed
            <strong>{operations.reliability.inbox.counts.failed}</strong>
          </div>
          <div className="portal-kpi">
            Stale processing
            <strong>{operations.reliability.inbox.staleProcessingCount}</strong>
          </div>
        </div>
      </section>

      <section className="portal-columns admin-split">
        <article className="portal-panel">
          <div className="portal-section-head">
            <h2>Outbox dispatch</h2>
          </div>
          <ul className="portal-list">
            <li>
              <strong>Dispatched:</strong> {operations.reliability.outbox.counts.dispatched}
            </li>
            <li>
              <strong>Retryable:</strong> {operations.reliability.outbox.retryableCount}
            </li>
            <li>
              <strong>Oldest pending:</strong> {operations.reliability.outbox.oldestPendingAt ?? "none"}
            </li>
            <li>
              <strong>Next retry:</strong> {operations.reliability.outbox.nextRetryAt ?? "none"}
            </li>
          </ul>
          <p className="portal-note">
            {operations.reliability.outbox.latestFailure
              ? `latest failure ${operations.reliability.outbox.latestFailure.eventType} | ${operations.reliability.outbox.latestFailure.source ?? "unknown source"} | ${operations.reliability.outbox.latestFailure.updatedAt}`
              : "No recent outbox dispatch failures."}
          </p>
          {operations.reliability.outbox.latestFailure?.lastError ? (
            <p className="portal-note">{operations.reliability.outbox.latestFailure.lastError}</p>
          ) : null}
          {operations.reliability.outbox.latestFailure?.id ? (
            <div className="portal-actions">
              <form action={replayOutboxEventAction}>
                <input name="eventId" type="hidden" value={operations.reliability.outbox.latestFailure.id} />
                <button className="portal-button" type="submit">
                  Replay latest failure
                </button>
              </form>
              <form action={markOutboxDeadLetterAction}>
                <input name="eventId" type="hidden" value={operations.reliability.outbox.latestFailure.id} />
                <button className="portal-button secondary" type="submit">
                  Force dead-letter
                </button>
              </form>
            </div>
          ) : null}
        </article>

        <article className="portal-panel">
          <div className="portal-section-head">
            <h2>Inbox consumers</h2>
          </div>
          <ul className="portal-list">
            <li>
              <strong>Consumers:</strong> {operations.reliability.inbox.consumerCount}
            </li>
            <li>
              <strong>Completed:</strong> {operations.reliability.inbox.counts.completed}
            </li>
            <li>
              <strong>Failed:</strong> {operations.reliability.inbox.counts.failed}
            </li>
            <li>
              <strong>Stale processing:</strong> {operations.reliability.inbox.staleProcessingCount}
            </li>
          </ul>
          <p className="portal-note">
            {operations.reliability.inbox.latestFailure
              ? `latest failure ${operations.reliability.inbox.latestFailure.consumer} | ${operations.reliability.inbox.latestFailure.eventType} | ${operations.reliability.inbox.latestFailure.updatedAt}`
              : "No recent inbox handler failures."}
          </p>
          {operations.reliability.inbox.latestFailure?.lastError ? (
            <p className="portal-note">{operations.reliability.inbox.latestFailure.lastError}</p>
          ) : null}
          {operations.reliability.inbox.latestFailure?.id ? (
            <div className="portal-actions">
              <form action={retryInboxMessageAction}>
                <input name="messageId" type="hidden" value={operations.reliability.inbox.latestFailure.id} />
                <button className="portal-button" type="submit">
                  Retry latest failure
                </button>
              </form>
              <form action={resetInboxMessageAction}>
                <input name="messageId" type="hidden" value={operations.reliability.inbox.latestFailure.id} />
                <button className="portal-button secondary" type="submit">
                  Reset message
                </button>
              </form>
            </div>
          ) : null}
        </article>
      </section>

      <section className="portal-panel">
        <div className="portal-section-head">
          <div>
            <span className="portal-pill">Calls</span>
            <h2>Calls and media operations</h2>
          </div>
        </div>
        <div className="portal-kpis">
          <div className="portal-kpi">
            Active sessions
            <strong>{operations.calls.kpis.activeSessions}</strong>
          </div>
          <div className="portal-kpi">
            Joined participants
            <strong>{operations.calls.kpis.joinedParticipants}</strong>
          </div>
          <div className="portal-kpi">
            Ready recordings
            <strong>{operations.calls.recordings.ready}</strong>
          </div>
          <div className="portal-kpi">
            Expiring soon
            <strong>{operations.calls.recordings.expiringSoon}</strong>
          </div>
          <div className="portal-kpi">
            Retention deleted
            <strong>{operations.calls.retention.deletedCount}</strong>
          </div>
        </div>
      </section>

      <section className="portal-columns admin-split">
        <article className="portal-panel">
          <div className="portal-section-head">
            <h2>Calls runtime</h2>
          </div>
          <p className="portal-note">
            total sessions {operations.calls.kpis.totalSessions} | upcoming schedules {operations.calls.kpis.upcomingSchedules}
          </p>
          <p className="portal-note">
            recordings: live {operations.calls.recordings.recording}, processing {operations.calls.recordings.processing}, failed {operations.calls.recordings.failed}, deleted {operations.calls.recordings.deleted}
          </p>
        </article>

        <article className="portal-panel">
          <div className="portal-section-head">
            <h2>Media plane</h2>
          </div>
          <p className="portal-note">
            {operations.calls.media.reachable ? `${operations.calls.media.status} | active sessions ${operations.calls.media.activeSessions ?? "n/a"}` : "media service unreachable"}
          </p>
          {operations.calls.media.error ? (
            <p className="portal-note">{operations.calls.media.error}</p>
          ) : null}
          <pre className="portal-code-block">
            {JSON.stringify(operations.calls.media.raw ?? operations.calls.media, null, 2)}
          </pre>
        </article>
      </section>

      <section className="portal-columns admin-split">
        <article className="portal-panel">
          <div className="portal-section-head">
            <h2>Retention</h2>
          </div>
          <p className="portal-note">
            last run {operations.calls.retention.ranAt ?? "not yet"} | deleted {operations.calls.retention.deletedCount}
          </p>
          <p className="portal-note">
            {operations.calls.retention.error ?? "last retention run completed without reported errors"}
          </p>
        </article>

        <article className="portal-panel">
          <div className="portal-section-head">
            <h2>Scheduled jobs</h2>
          </div>
          <ul className="portal-list">
            <li>
              <strong>Analytics:</strong> {formatJobState(operations.jobs.analytics)}
            </li>
            <li>
              <strong>Reporting:</strong> {formatJobState(operations.jobs.reporting)}
            </li>
            <li>
              <strong>Audit export:</strong> {formatJobState(operations.jobs.audit)}
            </li>
          </ul>
        </article>
      </section>

      <section className="portal-panel">
        <div className="portal-section-head">
          <h2>Maintenance actions</h2>
        </div>
        <form action={triggerSearchReindexAction} className="portal-form">
          <fieldset className="portal-fieldset">
            <legend>Search reindex</legend>
            <div className="portal-check-grid">
              <label className="portal-check">
                <input defaultChecked name="indices" type="checkbox" value="documents" />
                <span>documents</span>
              </label>
              <label className="portal-check">
                <input defaultChecked name="indices" type="checkbox" value="tasks" />
                <span>tasks</span>
              </label>
              <label className="portal-check">
                <input defaultChecked name="indices" type="checkbox" value="messages" />
                <span>messages</span>
              </label>
            </div>
            <label>
              Batch size
              <input className="portal-input" defaultValue="250" min="10" name="batchSize" type="number" />
            </label>
            <div className="portal-check-grid">
              <label className="portal-check">
                <input defaultChecked name="ensureIndices" type="checkbox" />
                <span>Ensure indices</span>
              </label>
              <label className="portal-check">
                <input defaultChecked name="refresh" type="checkbox" />
                <span>Refresh after reindex</span>
              </label>
            </div>
          </fieldset>
          <div className="portal-actions">
            <button className="portal-button" type="submit">
              Run reindex
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
