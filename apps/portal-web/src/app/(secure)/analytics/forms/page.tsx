import Link from "next/link";
import { createAnalyticsFormAction } from "../actions";
import { listAnalyticsFormRegistry } from "@/lib/analytics";

export default async function AnalyticsFormsPage() {
  const forms = await listAnalyticsFormRegistry();

  return (
    <div className="portal-stack">
      <section className="portal-panel">
        <div className="portal-section-head">
          <div>
            <span className="portal-pill">Forms</span>
            <h2>Create form template</h2>
          </div>
        </div>
        <form action={createAnalyticsFormAction} className="portal-form">
          <label>
            Name
            <input className="portal-input" name="name" required />
          </label>
          <label>
            Description
            <textarea className="portal-input" name="description" rows={3} />
          </label>
          <label>
            Incident type
            <input className="portal-input" name="incidentType" />
          </label>
          <label>
            Classification
            <input className="portal-input" defaultValue="1" max="3" min="0" name="classification" type="number" />
          </label>
          <label>
            Fields JSON
            <textarea
              className="portal-input"
              defaultValue={`[
  {"name":"field_observer","type":"text","label":"Field observer","required":true},
  {"name":"damage_level","type":"select","label":"Damage level","required":true,"options":["low","medium","high"]}
]`}
              name="fieldsJson"
              rows={8}
            />
          </label>
          <button className="portal-button" type="submit">
            Create form
          </button>
        </form>
      </section>

      <section className="portal-panel">
        <div className="portal-section-head">
          <div>
            <span className="portal-pill">Registry</span>
            <h2>Data collection forms</h2>
          </div>
        </div>
        <ul className="portal-list">
          {forms.length === 0 ? (
            <li>No published forms are available.</li>
          ) : (
            forms.map((form) => (
              <li key={form.id}>
                <Link className="portal-item-link" href={`/analytics/forms/${form.id}`}>
                  <strong>{form.name}</strong>
                </Link>
                <p className="portal-note">
                  {form.incidentType ?? "Generic"} | v{form.version} | {form.fieldCount} fields | {form.status}
                </p>
                <p className="portal-note">
                  Classification {form.classification} | submissions {form.submissionCount ?? 0} | published {form.publishedAt ?? "not published"}
                </p>
              </li>
            ))
          )}
        </ul>
      </section>
    </div>
  );
}
