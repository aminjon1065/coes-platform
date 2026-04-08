import {
  getAnalyticsForm,
  listAnalyticsFormSubmissions,
} from "@/lib/analytics";
import {
  publishAnalyticsFormAction,
  reviewAnalyticsSubmissionAction,
  submitAnalyticsFormAction,
} from "../../actions";

type AnalyticsFormDetailPageProps = {
  params: Promise<{
    id: string;
  }>;
};

export default async function AnalyticsFormDetailPage({
  params,
}: AnalyticsFormDetailPageProps) {
  const { id } = await params;
  const [form, submissions] = await Promise.all([
    getAnalyticsForm(id),
    listAnalyticsFormSubmissions(id),
  ]);

  return (
    <div className="portal-stack">
      <section className="portal-panel">
        <div className="portal-section-head">
          <div>
            <span className="portal-pill">{form.status}</span>
            <h2>{form.name}</h2>
          </div>
        </div>
        <p className="portal-note">
          {form.incidentType ?? "Generic"} | classification {form.classification} | {form.fieldCount} fields
        </p>
        {form.description ? <p className="portal-note">{form.description}</p> : null}
        {form.status !== "published" ? (
          <form action={publishAnalyticsFormAction}>
            <input name="formId" type="hidden" value={form.id} />
            <button className="portal-button" type="submit">
              Publish form
            </button>
          </form>
        ) : null}
      </section>

      <section className="portal-columns">
        <article className="portal-panel">
          <div className="portal-section-head">
            <h2>Fields</h2>
          </div>
          <pre className="portal-code-block">
            {JSON.stringify(form.fields ?? [], null, 2)}
          </pre>
        </article>

        <article className="portal-panel">
          <div className="portal-section-head">
            <h2>Submit sample payload</h2>
          </div>
          <form action={submitAnalyticsFormAction} className="portal-form">
            <input name="formId" type="hidden" value={form.id} />
            <label>
              Incident ID
              <input className="portal-input" name="incidentId" />
            </label>
            <label>
              Incident ref
              <input className="portal-input" name="incidentRef" />
            </label>
            <label>
              Data JSON
              <textarea className="portal-input" name="dataJson" rows={8} />
            </label>
            <button className="portal-button" type="submit">
              Submit form
            </button>
          </form>
        </article>
      </section>

      <section className="portal-panel">
        <div className="portal-section-head">
          <h2>Submissions</h2>
        </div>
        <ul className="portal-list">
          {submissions.length === 0 ? (
            <li>No submissions for this form yet.</li>
          ) : (
            submissions.map((submission) => (
              <li key={submission.id}>
                <strong>{submission.status}</strong>
                <p className="portal-note">
                  submitted {submission.submittedAt} | incident {submission.incidentRef ?? submission.incidentId ?? "n/a"}
                </p>
                <pre className="portal-code-block">
                  {JSON.stringify(submission.data, null, 2)}
                </pre>
                <form action={reviewAnalyticsSubmissionAction} className="portal-form">
                  <input name="formId" type="hidden" value={form.id} />
                  <input name="submissionId" type="hidden" value={submission.id} />
                  <label>
                    Review status
                    <select className="portal-input" defaultValue={submission.status} name="status">
                      <option value="submitted">submitted</option>
                      <option value="under_review">under_review</option>
                      <option value="accepted">accepted</option>
                      <option value="rejected">rejected</option>
                      <option value="requires_revision">requires_revision</option>
                    </select>
                  </label>
                  <label>
                    Notes
                    <input className="portal-input" defaultValue={submission.reviewNotes ?? ""} name="notes" />
                  </label>
                  <button className="portal-button secondary" type="submit">
                    Review submission
                  </button>
                </form>
              </li>
            ))
          )}
        </ul>
      </section>
    </div>
  );
}
