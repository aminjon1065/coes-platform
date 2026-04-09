import Link from "next/link";
import { getDocumentsData } from "@/lib/edms";
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
    <div className="space-y-6">
      <section className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <Card className="overflow-hidden border-white/70 bg-[linear-gradient(135deg,rgba(255,255,255,0.96),rgba(232,242,252,0.88))]">
          <CardHeader className="space-y-4">
            <Badge className="w-fit">EDMS</Badge>
            <div className="space-y-3">
              <CardTitle className="font-display text-4xl leading-tight">Documents</CardTitle>
              <CardDescription className="max-w-2xl text-base">
                {documents.total} items visible in the normalized portal flow.
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-3">
            <Button asChild variant="secondary">
              <Link href="/edms/archive">Archive</Link>
            </Button>
            <Button asChild>
              <Link href="/edms/new">New document</Link>
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="font-display text-2xl">Filters</CardTitle>
            <CardDescription>Search by title, status, and direction.</CardDescription>
          </CardHeader>
          <CardContent>
            <form className="grid gap-4" method="get">
              <div className="grid gap-4 md:grid-cols-3">
                <label className="grid gap-2 text-sm font-medium text-foreground">
                  Search
                  <Input defaultValue={search} name="search" />
                </label>
                <label className="grid gap-2 text-sm font-medium text-foreground">
                  Status
                  <select className="flex h-12 w-full rounded-2xl border border-border/70 bg-white/70 px-4 py-3 text-sm text-foreground shadow-sm outline-none focus-visible:border-ring focus-visible:ring-4 focus-visible:ring-ring/15" defaultValue={status ?? ""} name="status">
                    <option value="">All</option>
                    <option value="draft">draft</option>
                    <option value="registered">registered</option>
                    <option value="in_workflow">in_workflow</option>
                    <option value="completed">completed</option>
                    <option value="archived">archived</option>
                    <option value="cancelled">cancelled</option>
                  </select>
                </label>
                <label className="grid gap-2 text-sm font-medium text-foreground">
                  Direction
                  <select className="flex h-12 w-full rounded-2xl border border-border/70 bg-white/70 px-4 py-3 text-sm text-foreground shadow-sm outline-none focus-visible:border-ring focus-visible:ring-4 focus-visible:ring-ring/15" defaultValue={direction ?? ""} name="direction">
                    <option value="">All</option>
                    <option value="incoming">incoming</option>
                    <option value="outgoing">outgoing</option>
                    <option value="internal">internal</option>
                  </select>
                </label>
              </div>
              <Button className="w-fit" type="submit">
                Apply filters
              </Button>
            </form>
          </CardContent>
        </Card>
      </section>

      <Card>
        <CardHeader>
          <CardTitle className="font-display text-2xl">Visible documents</CardTitle>
          <CardDescription>Current EDMS result set from the portal BFF.</CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="space-y-3">
            {documents.items.length === 0 ? (
              <li className="rounded-2xl border border-dashed border-border bg-background/70 p-4 text-sm text-muted-foreground">
                No documents found.
              </li>
            ) : (
              documents.items.map((document) => (
                <li className="flex flex-col gap-4 rounded-3xl border border-border/70 bg-white/70 p-4 md:flex-row md:items-start md:justify-between" key={document.id}>
                  <div className="space-y-2">
                    <Link className="font-semibold text-foreground" href={`/edms/${document.id}`}>
                      {document.registrationNumber
                        ? `${document.registrationNumber} · ${document.title}`
                        : document.title}
                    </Link>
                    <p className="text-sm text-muted-foreground">
                      {document.typeName} · {document.direction} · class {document.classification}
                    </p>
                    <p className="text-sm text-muted-foreground">Updated {formatDate(document.updatedAt)}</p>
                  </div>
                  <Badge variant="secondary">{document.status}</Badge>
                </li>
              ))
            )}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
