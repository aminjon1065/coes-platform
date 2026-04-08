import Link from "next/link";
import { getDocumentsData } from "@/lib/edms";

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString("en-GB");
}

type DocumentsPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function DocumentsPage({ searchParams }: DocumentsPageProps) {
  const params = (await searchParams) ?? {};
  const status = typeof params.status === "string" ? params.status : undefined;
  const direction = typeof params.direction === "string" ? params.direction : undefined;
  const search = typeof params.search === "string" ? params.search : undefined;
  const documents = await getDocumentsData({ status, direction, search, limit: 20, offset: 0 });

  return (
    <div className="portal-stack">
      <section className="portal-panel">
        <div className="portal-section-head">
          <div>
            <span className="portal-pill">EDMS</span>
            <h2>Documents</h2>
            <p className="portal-note">{documents.total} items visible in the normalized portal flow.</p>
          </div>
          <div className="portal-actions">
            <Link className="portal-button secondary" href="/edms/archive">
              Archive
            </Link>
            <Link className="portal-button" href="/edms/new">
              New document
            </Link>
          </div>
        </div>

        <form className="portal-form" method="get">
          <div className="portal-columns portal-columns-tight">
            <label>
              Search
              <input className="portal-input" defaultValue={search} name="search" />
            </label>
            <label>
              Status
              <select className="portal-input" defaultValue={status ?? ""} name="status">
                <option value="">All</option>
                <option value="draft">draft</option>
                <option value="registered">registered</option>
                <option value="in_workflow">in_workflow</option>
                <option value="completed">completed</option>
                <option value="archived">archived</option>
                <option value="cancelled">cancelled</option>
              </select>
            </label>
            <label>
              Direction
              <select className="portal-input" defaultValue={direction ?? ""} name="direction">
                <option value="">All</option>
                <option value="incoming">incoming</option>
                <option value="outgoing">outgoing</option>
                <option value="internal">internal</option>
              </select>
            </label>
          </div>
          <div className="portal-actions">
            <button className="portal-button" type="submit">
              Apply filters
            </button>
          </div>
        </form>
      </section>

      <section className="portal-panel">
        <ul className="portal-list">
          {documents.items.length === 0 ? (
            <li>No documents found.</li>
          ) : (
            documents.items.map((document) => (
              <li key={document.id}>
                <div className="portal-row">
                  <div>
                    <Link className="portal-item-link" href={`/edms/${document.id}`}>
                      {document.registrationNumber
                        ? `${document.registrationNumber} · ${document.title}`
                        : document.title}
                    </Link>
                    <p className="portal-note">
                      {document.typeName} · {document.direction} · class {document.classification}
                    </p>
                    <p className="portal-note">Updated {formatDate(document.updatedAt)}</p>
                  </div>
                  <span className="portal-pill">{document.status}</span>
                </div>
              </li>
            ))
          )}
        </ul>
      </section>
    </div>
  );
}
