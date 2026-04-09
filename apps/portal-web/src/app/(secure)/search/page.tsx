import Link from "next/link";
import { PORTAL_SEARCH_INDICES, type PortalSearchIndex, runGlobalSearch } from "@/lib/search";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";

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
    <div className="space-y-6">
      <section className="grid gap-4 xl:grid-cols-[1fr_0.85fr]">
        <Card className="overflow-hidden border-white/70 bg-[linear-gradient(135deg,rgba(255,255,255,0.96),rgba(232,242,252,0.88))]">
          <CardHeader className="space-y-4">
            <Badge className="w-fit">Search</Badge>
            <div className="space-y-3">
              <CardTitle className="font-display text-4xl leading-tight">Global search</CardTitle>
              <CardDescription className="max-w-2xl text-base">
                Unified cross-domain search across indexed tasks, documents, and messages.
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <form className="grid gap-4" method="get">
              <label className="grid gap-2 text-sm font-medium text-foreground">
                Query
                <Input
                  defaultValue={query}
                  name="q"
                  placeholder="Search tasks, documents, and indexed messages"
                />
              </label>
              <div className="grid gap-3 md:grid-cols-3">
                {PORTAL_SEARCH_INDICES.map((index) => (
                  <label
                    className="flex items-center gap-3 rounded-2xl border border-border/70 bg-white/70 px-4 py-3 text-sm text-foreground"
                    key={index}
                  >
                    <input
                      className="size-4 accent-[var(--primary)]"
                      defaultChecked={indices.length === 0 || indices.includes(index)}
                      name="indices"
                      type="checkbox"
                      value={index}
                    />
                    <span>{index}</span>
                  </label>
                ))}
              </div>
              <Button className="w-fit" type="submit">
                Search
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card className="border-white/70 bg-[linear-gradient(180deg,rgba(13,27,47,0.94),rgba(19,46,78,0.9))] text-white">
          <CardHeader>
            <CardDescription className="text-white/60">Search summary</CardDescription>
            <CardTitle className="font-display text-3xl text-white">
              {result ? `${result.total} hits` : "Awaiting query"}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-white/70">
            {result ? (
              <>
                <div className="rounded-2xl border border-white/10 bg-white/6 p-4">
                  Took {result.took} ms
                </div>
                <div className="flex flex-wrap gap-2">
                  {(indices.length > 0 ? indices : PORTAL_SEARCH_INDICES).map((index) => (
                    <Badge className="border-white/10 bg-white/10 text-white" key={index}>
                      {index}
                    </Badge>
                  ))}
                </div>
              </>
            ) : (
              <p>Enter a query to run the unified cross-domain search.</p>
            )}
          </CardContent>
        </Card>
      </section>

      <Card>
        <CardHeader>
          <CardTitle className="font-display text-2xl">Results</CardTitle>
          <CardDescription>Ranked results from the selected search indices.</CardDescription>
        </CardHeader>
        <CardContent>
          {result ? (
            <ul className="space-y-3">
              {result.hits.map((hit) => (
                <li className="rounded-3xl border border-border/70 bg-white/70 p-4" key={`${hit.index}-${hit.id}`}>
                  <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                    <div className="space-y-3">
                      <Badge>{hit.index}</Badge>
                      <div>
                        {hit.href ? (
                          <Link className="font-semibold text-foreground" href={hit.href}>
                            {hit.title}
                          </Link>
                        ) : (
                          <p className="font-semibold text-foreground">{hit.title}</p>
                        )}
                      </div>
                      <p className="leading-7 text-foreground">{renderSnippet(hit)}</p>
                      <p className="text-sm text-muted-foreground">
                        class {hit.classification ?? "n/a"} · updated {formatDateTime(hit.updatedAt)}
                      </p>
                    </div>
                    <div className="text-sm text-muted-foreground">score {hit.score.toFixed(2)}</div>
                  </div>
                </li>
              ))}
              {result.hits.length === 0 ? (
                <li className="rounded-2xl border border-dashed border-border bg-background/70 p-4 text-sm text-muted-foreground">
                  No results found.
                </li>
              ) : null}
            </ul>
          ) : (
            <p className="rounded-2xl border border-dashed border-border bg-background/70 p-4 text-sm text-muted-foreground">
              Enter a query to run the unified cross-domain search.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
