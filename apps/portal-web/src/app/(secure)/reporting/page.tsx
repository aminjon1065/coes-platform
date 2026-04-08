import Link from "next/link";
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
    <div className="portal-stack">
      <section className="portal-panel">
        <div className="portal-section-head">
          <div>
            <span className="portal-pill">Reporting</span>
            <h2>Report definitions and executions</h2>
          </div>
        </div>
        <p className="portal-note">
          This module manages reusable report definitions, scheduled delivery settings,
          and manual execution for cross-domain operational reporting.
        </p>
      </section>

      <section className="portal-columns admin-split">
        <article className="portal-panel">
          <div className="portal-section-head">
            <h2>Definitions</h2>
          </div>
          <ul className="portal-list">
            {definitions.length === 0 ? (
              <li>No report definitions configured.</li>
            ) : (
              definitions.map((definition) => {
                const latestExecution = latestExecutions.get(definition.id);

                return (
                  <li key={definition.id}>
                    <Link className="portal-item-link" href={`/reporting/${definition.id}`}>
                      <strong>{definition.name}</strong>
                      <p className="portal-note">
                        {definition.reportType} | {definition.defaultFormat} | classification {definition.classification}
                      </p>
                      <p className="portal-note">
                        {definition.isScheduled
                          ? `Scheduled ${definition.cronExpression ?? "configured"}`
                          : "Manual only"}
                        {latestExecution ? ` | latest ${latestExecution.status}` : " | not yet run"}
                      </p>
                    </Link>
                    <form action={triggerReportExecutionAction} className="portal-form">
                      <input name="definitionId" type="hidden" value={definition.id} />
                      <label>
                        Parameters JSON
                        <textarea className="portal-input" name="parametersJson" rows={4} />
                      </label>
                      <button className="portal-button secondary" type="submit">
                        Run now
                      </button>
                    </form>
                  </li>
                );
              })
            )}
          </ul>
        </article>

        <article className="portal-panel">
          <div className="portal-section-head">
            <h2>Create definition</h2>
          </div>
          <form action={createReportDefinitionAction} className="portal-form">
            <label>
              Name
              <input className="portal-input" name="name" required />
            </label>
            <label>
              Description
              <textarea className="portal-input" name="description" rows={3} />
            </label>
            <label>
              Report type
              <select className="portal-input" defaultValue="incident_statistical" name="reportType">
                <option value="incident_statistical">incident_statistical</option>
                <option value="cross_domain">cross_domain</option>
                <option value="risk_forecast_summary">risk_forecast_summary</option>
                <option value="resource_utilisation">resource_utilisation</option>
                <option value="response_time_analysis">response_time_analysis</option>
                <option value="custom">custom</option>
              </select>
            </label>
            <label>
              Default format
              <select className="portal-input" defaultValue="json" name="defaultFormat">
                <option value="json">json</option>
                <option value="pdf">pdf</option>
                <option value="csv">csv</option>
                <option value="xlsx">xlsx</option>
              </select>
            </label>
            <label>
              Classification
              <input className="portal-input" defaultValue="1" max="3" min="0" name="classification" type="number" />
            </label>
            <label className="portal-check">
              <input name="isScheduled" type="checkbox" value="true" />
              <span>Scheduled report</span>
            </label>
            <label>
              Cron expression
              <input className="portal-input" name="cronExpression" placeholder="0 6 * * *" />
            </label>
            <label>
              Delivery channel
              <select className="portal-input" defaultValue="download" name="deliveryChannel">
                <option value="download">download</option>
                <option value="email">email</option>
                <option value="webhook">webhook</option>
              </select>
            </label>
            <label>
              Query spec JSON
              <textarea
                className="portal-input"
                defaultValue={`{
  "dateFrom": "2026-01-01T00:00:00.000Z",
  "dateTo": "2026-04-08T00:00:00.000Z",
  "groupBy": "type"
}`}
                name="querySpecJson"
                rows={8}
              />
            </label>
            <label>
              Delivery config JSON
              <textarea className="portal-input" defaultValue="{}" name="deliveryConfigJson" rows={4} />
            </label>
            <button className="portal-button" type="submit">
              Create definition
            </button>
          </form>
        </article>
      </section>
    </div>
  );
}
