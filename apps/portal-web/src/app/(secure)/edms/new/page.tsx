import Link from "next/link";
import { createDocumentAction } from "./actions";
import { getDocumentTypes, getPositionOptions } from "@/lib/edms";

export default async function NewDocumentPage() {
  const [documentTypes, positions] = await Promise.all([
    getDocumentTypes(),
    getPositionOptions(),
  ]);

  return (
    <div className="portal-stack">
      <section className="portal-panel">
        <div className="portal-section-head">
          <div>
            <span className="portal-pill">EDMS create</span>
            <h2>New document</h2>
            <p className="portal-note">
              Recipients format: <code>name|type|positionId</code> per line.
            </p>
          </div>
          <Link className="portal-button secondary" href="/edms">
            Back to EDMS
          </Link>
        </div>

        <form action={createDocumentAction} className="portal-form">
          <div className="portal-columns">
            <label>
              Document type
              <select className="portal-input" defaultValue={documentTypes[0]?.id ?? ""} name="typeId">
                {documentTypes.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name} ({item.seriesCode ?? "no-series"})
                  </option>
                ))}
              </select>
            </label>
            <label>
              Direction
              <select className="portal-input" defaultValue="internal" name="direction">
                <option value="incoming">incoming</option>
                <option value="outgoing">outgoing</option>
                <option value="internal">internal</option>
              </select>
            </label>
            <label>
              Classification
              <input className="portal-input" defaultValue={1} max={3} min={0} name="classification" type="number" />
            </label>
            <label>
              Sender position
              <select className="portal-input" defaultValue="" name="senderPositionId">
                <option value="">Not set</option>
                {positions.map((position) => (
                  <option key={position.id} value={position.id}>
                    {position.title}
                    {position.departmentName ? ` (${position.departmentName})` : ""}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label>
            Subject
            <input className="portal-input" name="subject" required />
          </label>

          <div className="portal-columns">
            <label>
              Sender name
              <input className="portal-input" name="senderName" />
            </label>
            <label>
              External reference number
              <input className="portal-input" name="externalRefNumber" />
            </label>
            <label>
              Document date
              <input className="portal-input" name="documentDate" type="date" />
            </label>
            <label>
              Deadline
              <input className="portal-input" name="deadline" type="date" />
            </label>
          </div>

          <label>
            Recipients
            <textarea className="portal-input" name="recipients" rows={5} />
          </label>

          <label>
            Body
            <textarea className="portal-input" name="body" rows={8} />
          </label>

          <label>
            Related document ID
            <input className="portal-input" name="relatedDocumentId" />
          </label>

          <div className="portal-actions">
            <button className="portal-button" type="submit">
              Create draft
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
