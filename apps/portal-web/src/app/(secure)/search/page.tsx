import Link from "next/link";
import { PORTAL_SEARCH_INDICES, type PortalSearchIndex, runGlobalSearch } from "@/lib/search";

type SearchPageProps = {
  searchParams?: Promise<{ q?: string; indices?: string | string[] }>;
};

function parseIndices(value: string | string[] | undefined): PortalSearchIndex[] {
  const values = Array.isArray(value) ? value : value ? [value] : [];
  return values.filter((item): item is PortalSearchIndex =>
    PORTAL_SEARCH_INDICES.includes(item as PortalSearchIndex),
  );
}

function formatDateTime(value: string | null) {
  if (!value) {
    return "n/a";
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString("en-GB");
}

function renderSnippet(hit: Awaited<ReturnType<typeof runGlobalSearch>>["hits"][number]) {
  const highlight = hit.highlights
    ? Object.values(hit.highlights).flat().find(Boolean)
    : null;

  const snippet = highlight ?? hit.body ?? "No preview available.";
  return snippet.replace(/<\/?mark>/g, "");
}

export default async function SearchPage({ searchParams }: SearchPageProps) {
  const params = (await searchParams) ?? {};
  const query = params.q?.trim() ?? "";
  const indices = parseIndices(params.indices);
  const result =
    query.length > 0
      ? await runGlobalSearch({
          q: query,
          indices: indices.length > 0 ? indices : undefined,
        })
      : null;

  return (
    <div className="portal-stack">
      <section className="portal-panel">
        <div className="portal-section-head">
          <div>
            <span className="portal-pill">Search</span>
            <h2>Global search</h2>
          </div>
        </div>
        <form className="portal-form" method="get">
          <label>
            Query
            <input
              className="portal-input"
              defaultValue={query}
              name="q"
              placeholder="Search tasks, documents, and indexed messages"
            />
          </label>
          <div className="portal-check-grid">
            {PORTAL_SEARCH_INDICES.map((index) => (
              <label key={index} className="portal-check">
                <input
                  defaultChecked={indices.length === 0 || indices.includes(index)}
                  name="indices"
                  type="checkbox"
                  value={index}
                />
                <span>{index}</span>
              </label>
            ))}
          </div>
          <div className="portal-actions">
            <button className="portal-button" type="submit">
              Search
            </button>
          </div>
        </form>
      </section>

      <section className="portal-panel">
        {result ? (
          <>
            <p className="portal-note">
              {result.total} hits · {result.took} ms
            </p>
            <ul className="portal-list">
              {result.hits.map((hit) => (
                <li key={`${hit.index}-${hit.id}`}>
                  <div className="portal-row">
                    <div>
                      <span className="portal-pill">{hit.index}</span>
                      <h3>
                        {hit.href ? (
                          <Link className="portal-item-link" href={hit.href}>
                            {hit.title}
                          </Link>
                        ) : (
                          hit.title
                        )}
                      </h3>
                      <p>{renderSnippet(hit)}</p>
                      <p className="portal-note">
                        class {hit.classification ?? "n/a"} · updated {formatDateTime(hit.updatedAt)}
                      </p>
                    </div>
                    <div className="portal-metadata">
                      <span>score {hit.score.toFixed(2)}</span>
                    </div>
                  </div>
                </li>
              ))}
              {result.hits.length === 0 ? <li>No results found.</li> : null}
            </ul>
          </>
        ) : (
          <p className="portal-note">Enter a query to run the unified cross-domain search.</p>
        )}
      </section>
    </div>
  );
}
