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
    <div className="portal-stack">
      <section className="portal-panel">
        <div className="portal-section-head">
          <div>
            <span className="portal-pill">{definition.reportType}</span>
            <h2>{definition.name}</h2>
          </div>
        </div>
        <p className="portal-note">
          {definition.description ?? "No description"} | {definition.defaultFormat} | {definition.deliveryChannel}
        </p>
        <p className="portal-note">
          classification {definition.classification} | owner {definition.ownerId} |{" "}
          {definition.isScheduled ? `scheduled ${definition.cronExpression ?? "configured"}` : "manual only"}
        </p>
      </section>

      <section className="portal-columns">
        <article className="portal-panel">
          <div className="portal-section-head">
            <h2>Query spec</h2>
          </div>
          <pre className="portal-code-block">
            {JSON.stringify(definition.querySpec, null, 2)}
          </pre>
        </article>

        <article className="portal-panel">
          <div className="portal-section-head">
            <h2>Run definition</h2>
          </div>
          <form action={triggerReportExecutionAction} className="portal-form">
            <input name="definitionId" type="hidden" value={definition.id} />
            <label>
              Parameters JSON
              <textarea className="portal-input" defaultValue="{}" name="parametersJson" rows={8} />
            </label>
            <button className="portal-button" type="submit">
              Trigger execution
            </button>
          </form>
        </article>
      </section>

      <section className="portal-panel">
        <div className="portal-section-head">
          <h2>Executions</h2>
        </div>
        <ul className="portal-list">
          {executions.length === 0 ? (
            <li>No executions for this definition yet.</li>
          ) : (
            executions.map((execution) => (
              <li key={execution.id}>
                <strong>{execution.status}</strong>
                <p className="portal-note">
                  {execution.triggerSource} | {execution.format} | rows {execution.rowCount ?? 0}
                </p>
                <p className="portal-note">
                  started {execution.startedAt ?? "n/a"} | completed {execution.completedAt ?? "n/a"}
                </p>
                {execution.errorMessage ? (
                  <p className="portal-note">Error: {execution.errorMessage}</p>
                ) : null}
                {execution.inlineResult ? (
                  <pre className="portal-code-block">
                    {JSON.stringify(execution.inlineResult, null, 2)}
                  </pre>
                ) : null}
              </li>
            ))
          )}
        </ul>
      </section>
    </div>
  );
}
