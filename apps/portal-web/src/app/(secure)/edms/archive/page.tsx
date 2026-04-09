import Link from "next/link";
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
    <div className="space-y-6">
      <Card className="border-border/60 bg-white/90 shadow-sm">
        <CardHeader className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-3">
            <Badge variant="outline" className="w-fit">
              EDMS archive
            </Badge>
            <div className="space-y-1">
              <CardTitle className="font-heading text-3xl">Archived documents</CardTitle>
              <CardDescription>{archive.total} archived documents available.</CardDescription>
            </div>
          </div>
          <Link href="/edms">
            <Button type="button" variant="outline">
              Back to EDMS
            </Button>
          </Link>
        </CardHeader>
        <CardContent>
          <form className="grid gap-4 md:grid-cols-2" method="get">
            <label className="space-y-2 text-sm font-medium text-foreground">
              <span>Search</span>
              <Input defaultValue={search} name="search" />
            </label>
            <label className="space-y-2 text-sm font-medium text-foreground">
              <span>Review before</span>
              <Input defaultValue={reviewBefore} name="reviewBefore" type="date" />
            </label>
            <div className="md:col-span-2">
              <Button type="submit">Filter archive</Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card className="border-border/60 bg-white/90 shadow-sm">
        <CardHeader>
          <CardTitle className="font-heading text-2xl">Archive results</CardTitle>
          <CardDescription>Retention review and archived registration records.</CardDescription>
        </CardHeader>
        <CardContent>
          {archive.items.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border/70 bg-muted/30 px-4 py-8 text-sm text-muted-foreground">
              No archived documents found.
            </div>
          ) : (
            <div className="space-y-3">
              {archive.items.map((document) => (
                <Link
                  key={document.id}
                  className="block rounded-3xl border border-border/70 bg-background/80 p-5 transition hover:border-primary/35 hover:shadow-sm"
                  href={`/edms/${document.id}`}
                >
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="space-y-2">
                      <h3 className="text-lg font-semibold text-foreground">
                        {document.registrationNumber
                          ? `${document.registrationNumber} | ${document.title}`
                          : document.title}
                      </h3>
                      <p className="text-sm text-muted-foreground">
                        {document.typeName} | class {document.classification}
                      </p>
                    </div>
                    <div className="flex flex-col gap-2 text-sm text-muted-foreground">
                      <span>Archived {formatDate(document.archivedAt)}</span>
                      <span>Review {formatDate(document.retentionReviewDate)}</span>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
