import { requestAnalyticsReportAction } from "../actions";
import { listAnalyticsReports } from "@/lib/analytics";

export default async function AnalyticsReportsPage() {
  const reports = await listAnalyticsReports();

  return (
    <div className="portal-stack">
      <section className="portal-panel">
        <div className="portal-section-head">
          <div>
            <span className="portal-pill">Reports</span>
            <h2>Request analytical report</h2>
          </div>
        </div>
        <form action={requestAnalyticsReportAction} className="portal-form">
          <label>
            Report type
            <select className="portal-input" defaultValue="incident_summary" name="reportType">
              <option value="incident_summary">incident_summary</option>
              <option value="response_performance">response_performance</option>
              <option value="resource_utilisation">resource_utilisation</option>
              <option value="trend_analysis">trend_analysis</option>
              <option value="seasonal_pattern">seasonal_pattern</option>
            </select>
          </label>
          <label>
            From
            <input className="portal-input" name="from" type="date" />
          </label>
          <label>
            To
            <input className="portal-input" name="to" type="date" />
          </label>
          <label>
            Incident type
            <input className="portal-input" name="incidentType" />
          </label>
          <label>
            Administrative code
            <input className="portal-input" name="administrativeCode" />
          </label>
          <label>
            Format
            <select className="portal-input" defaultValue="json" name="format">
              <option value="json">json</option>
              <option value="csv">csv</option>
              <option value="pdf">pdf</option>
              <option value="xlsx">xlsx</option>
            </select>
          </label>
          <label>
            Classification
            <input className="portal-input" defaultValue="1" max="3" min="0" name="classification" type="number" />
          </label>
          <button className="portal-button" type="submit">
            Request report
          </button>
        </form>
      </section>

      <section className="portal-panel">
        <div className="portal-section-head">
          <div>
            <span className="portal-pill">Reports</span>
            <h2>Generated analytical reports</h2>
          </div>
        </div>
        <ul className="portal-list">
          {reports.length === 0 ? (
            <li>No reports generated yet.</li>
          ) : (
            reports.map((report) => (
              <li key={report.id}>
                <strong>{report.title}</strong>
                <p className="portal-note">
                  {report.reportType} | {report.format} | {report.status}
                </p>
                <p className="portal-note">
                  Rows {report.rowCount ?? 0} | generated {report.generatedAt ?? "pending"} | expires {report.expiresAt ?? "n/a"}
                </p>
              </li>
            ))
          )}
        </ul>
      </section>
    </div>
  );
}
