import {
  getAnalyticsIncident,
  getAnalyticsIncidentResources,
  getAnalyticsIncidentResponses,
} from "@/lib/analytics";
import {
  deployAnalyticsResourceAction,
  recordAnalyticsResponseAction,
  updateAnalyticsIncidentAction,
  withdrawAnalyticsResourceAction,
} from "../../actions";

type AnalyticsIncidentDetailPageProps = {
  params: Promise<{
    id: string;
  }>;
};

export default async function AnalyticsIncidentDetailPage({
  params,
}: AnalyticsIncidentDetailPageProps) {
  const { id } = await params;
  const [incident, responses, resources] = await Promise.all([
    getAnalyticsIncident(id),
    getAnalyticsIncidentResponses(id),
    getAnalyticsIncidentResources(id),
  ]);

  return (
    <div className="portal-stack">
      <section className="portal-panel">
        <div className="portal-section-head">
          <div>
            <span className="portal-pill">{incident.incidentRef}</span>
            <h2>{incident.title}</h2>
          </div>
        </div>
        <div className="portal-columns">
          <div>
            <p className="portal-note">Type</p>
            <p>{incident.incidentType}</p>
          </div>
          <div>
            <p className="portal-note">Severity</p>
            <p>{incident.severity}</p>
          </div>
          <div>
            <p className="portal-note">Status</p>
            <p>{incident.status}</p>
          </div>
          <div>
            <p className="portal-note">Region</p>
            <p>{incident.administrativeName ?? incident.administrativeCode ?? "n/a"}</p>
          </div>
        </div>
        <div className="portal-columns">
          <div>
            <p className="portal-note">Reported</p>
            <p>{incident.reportedAt}</p>
          </div>
          <div>
            <p className="portal-note">First response</p>
            <p>{incident.firstResponseAt ?? "n/a"}</p>
          </div>
          <div>
            <p className="portal-note">Affected population</p>
            <p>{incident.affectedPopulation ?? 0}</p>
          </div>
          <div>
            <p className="portal-note">Casualties</p>
            <p>{incident.casualtiesConfirmed} confirmed / {incident.casualtiesSuspected} suspected</p>
          </div>
        </div>
      </section>

      <section className="portal-panel">
        <div className="portal-section-head">
          <h2>Update incident</h2>
        </div>
        <form action={updateAnalyticsIncidentAction} className="portal-form">
          <input name="incidentId" type="hidden" value={incident.id} />
          <label>
            Status
            <select className="portal-input" defaultValue={incident.status} name="status">
              <option value="">Keep current</option>
              <option value="open">open</option>
              <option value="responding">responding</option>
              <option value="contained">contained</option>
              <option value="resolved">resolved</option>
              <option value="closed">closed</option>
              <option value="cancelled">cancelled</option>
            </select>
          </label>
          <label>
            Severity
            <select className="portal-input" defaultValue={incident.severity} name="severity">
              <option value="">Keep current</option>
              <option value="minor">minor</option>
              <option value="moderate">moderate</option>
              <option value="major">major</option>
              <option value="catastrophic">catastrophic</option>
            </select>
          </label>
          <label>
            Affected population
            <input className="portal-input" defaultValue={incident.affectedPopulation ?? ""} min="0" name="affectedPopulation" type="number" />
          </label>
          <label>
            Confirmed casualties
            <input className="portal-input" defaultValue={incident.casualtiesConfirmed} min="0" name="casualtiesConfirmed" type="number" />
          </label>
          <label>
            Suspected casualties
            <input className="portal-input" defaultValue={incident.casualtiesSuspected} min="0" name="casualtiesSuspected" type="number" />
          </label>
          <label>
            Affected area km2
            <input className="portal-input" defaultValue={incident.affectedAreaKm2 ?? ""} min="0" name="affectedAreaKm2" step="0.1" type="number" />
          </label>
          <label>
            Internal notes
            <textarea className="portal-input" defaultValue="" name="internalNotes" rows={4} />
          </label>
          <button className="portal-button" type="submit">
            Update incident
          </button>
        </form>
      </section>

      <section className="portal-columns">
        <article className="portal-panel">
          <div className="portal-section-head">
            <h2>Response timeline</h2>
          </div>
          <form action={recordAnalyticsResponseAction} className="portal-form">
            <input name="incidentId" type="hidden" value={incident.id} />
            <label>
              Action
              <select className="portal-input" defaultValue="dispatched" name="action">
                <option value="dispatched">dispatched</option>
                <option value="on_scene">on_scene</option>
                <option value="evacuated">evacuated</option>
                <option value="contained">contained</option>
                <option value="remediated">remediated</option>
                <option value="assessment_completed">assessment_completed</option>
                <option value="report_filed">report_filed</option>
                <option value="resources_released">resources_released</option>
              </select>
            </label>
            <label>
              Description
              <input className="portal-input" name="description" />
            </label>
            <label>
              Outcome
              <input className="portal-input" name="outcome" />
            </label>
            <button className="portal-button" type="submit">
              Record response
            </button>
          </form>
          <ul className="portal-list">
            {responses.length === 0 ? (
              <li>No response actions recorded.</li>
            ) : (
              responses.map((response) => (
                <li key={response.id}>
                  <strong>{response.action}</strong>
                  <p className="portal-note">
                    {response.occurredAt} | {response.description ?? "No description"}
                  </p>
                </li>
              ))
            )}
          </ul>
        </article>

        <article className="portal-panel">
          <div className="portal-section-head">
            <h2>Resource deployments</h2>
          </div>
          <form action={deployAnalyticsResourceAction} className="portal-form">
            <input name="incidentId" type="hidden" value={incident.id} />
            <label>
              Resource type
              <select className="portal-input" defaultValue="personnel" name="resourceType">
                <option value="personnel">personnel</option>
                <option value="vehicle">vehicle</option>
                <option value="equipment">equipment</option>
                <option value="medical">medical</option>
                <option value="shelter">shelter</option>
                <option value="food_water">food_water</option>
                <option value="communication">communication</option>
                <option value="aerial">aerial</option>
                <option value="other">other</option>
              </select>
            </label>
            <label>
              Resource name
              <input className="portal-input" name="resourceName" required />
            </label>
            <label>
              Quantity
              <input className="portal-input" defaultValue="1" min="1" name="quantity" type="number" />
            </label>
            <label>
              Unit
              <input className="portal-input" name="unit" />
            </label>
            <button className="portal-button" type="submit">
              Deploy resource
            </button>
          </form>
          <ul className="portal-list">
            {resources.length === 0 ? (
              <li>No resource deployments recorded.</li>
            ) : (
              resources.map((resource) => (
                <li key={resource.id}>
                  <strong>{resource.resourceName}</strong>
                  <p className="portal-note">
                    {resource.resourceType} | {resource.quantity} {resource.unit ?? "units"} | deployed {resource.deployedAt}
                  </p>
                  {resource.withdrawnAt ? (
                    <p className="portal-note">Withdrawn {resource.withdrawnAt}</p>
                  ) : (
                    <form action={withdrawAnalyticsResourceAction}>
                      <input name="incidentId" type="hidden" value={incident.id} />
                      <input name="resourceId" type="hidden" value={resource.id} />
                      <button className="portal-button secondary" type="submit">
                        Withdraw
                      </button>
                    </form>
                  )}
                </li>
              ))
            )}
          </ul>
        </article>
      </section>
    </div>
  );
}
