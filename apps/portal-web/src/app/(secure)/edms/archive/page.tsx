import Link from "next/link";
import { getArchivedDocumentsData } from "@/lib/edms";

function formatDate(value: string | null) {
  if (!value) return "Not set";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString("en-GB");
}

type ArchivePageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function EdmsArchivePage({ searchParams }: ArchivePageProps) {
  const params = (await searchParams) ?? {};
  const search = typeof params.search === "string" ? params.search : undefined;
  const reviewBefore =
    typeof params.reviewBefore === "string" ? params.reviewBefore : undefined;
  const archive = await getArchivedDocumentsData({
    search,
    reviewBefore,
    limit: 20,
    offset: 0,
  });

  return (
    <div className="portal-stack">
      <section className="portal-panel">
        <div className="portal-section-head">
          <div>
            <span className="portal-pill">EDMS archive</span>
            <h2>Archived documents</h2>
            <p className="portal-note">{archive.total} archived documents available.</p>
          </div>
          <div className="portal-actions">
            <Link className="portal-button secondary" href="/edms">
              Back to EDMS
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
              Review before
              <input className="portal-input" defaultValue={reviewBefore} name="reviewBefore" type="date" />
            </label>
          </div>
          <div className="portal-actions">
            <button className="portal-button" type="submit">
              Filter archive
            </button>
          </div>
        </form>
      </section>

      <section className="portal-panel">
        <ul className="portal-list">
          {archive.items.length === 0 ? (
            <li>No archived documents found.</li>
          ) : (
            archive.items.map((document) => (
              <li key={document.id}>
                <div className="portal-row">
                  <div>
                    <Link className="portal-item-link" href={`/edms/${document.id}`}>
                      {document.registrationNumber
                        ? `${document.registrationNumber} · ${document.title}`
                        : document.title}
                    </Link>
                    <p className="portal-note">
                      {document.typeName} · class {document.classification}
                    </p>
                  </div>
                  <div className="portal-metadata">
                    <span>Archived {formatDate(document.archivedAt)}</span>
                    <span>Review {formatDate(document.retentionReviewDate)}</span>
                  </div>
                </div>
              </li>
            ))
          )}
        </ul>
      </section>
    </div>
  );
}
