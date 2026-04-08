import { getSearchHealth, getSystemHealth } from "@/lib/admin";
import { triggerSearchReindexAction } from "../actions";

export default async function AdminSystemPage() {
  const [systemHealth, searchHealth] = await Promise.all([
    getSystemHealth(),
    getSearchHealth(),
  ]);

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
            <strong>{systemHealth.status}</strong>
          </div>
          <div className="portal-kpi">
            Uptime
            <strong>{systemHealth.uptimeSeconds}s</strong>
          </div>
          <div className="portal-kpi">
            Search health
            <strong>{searchHealth.ready ? "ready" : "degraded"}</strong>
          </div>
        </div>
      </section>

      <section className="portal-columns admin-split">
        <article className="portal-panel">
          <div className="portal-section-head">
            <h2>Runtime health</h2>
          </div>
          <pre className="portal-code-block">
            {JSON.stringify(systemHealth, null, 2)}
          </pre>
        </article>

        <article className="portal-panel">
          <div className="portal-section-head">
            <h2>Search readiness</h2>
          </div>
          <pre className="portal-code-block">
            {JSON.stringify(searchHealth.details, null, 2)}
          </pre>
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
