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
import { Textarea } from "@/components/ui/textarea";
import { createAnalyticsFormAction } from "../actions";
import { listAnalyticsFormRegistry } from "@/lib/analytics";

export default async function AnalyticsFormsPage() {
  const forms = await listAnalyticsFormRegistry();

  return (
    <div className="space-y-6">
      <Card className="border-border/60 bg-white/90 shadow-sm">
        <CardHeader className="gap-3">
          <Badge variant="outline" className="w-fit">
            Forms
          </Badge>
          <div className="space-y-1">
            <CardTitle className="font-heading text-3xl">Create form template</CardTitle>
            <CardDescription>
              Define a reusable data-collection form for field and incident reporting.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <form action={createAnalyticsFormAction} className="grid gap-4 md:grid-cols-2">
            <label className="space-y-2 text-sm font-medium text-foreground">
              <span>Name</span>
              <Input name="name" required />
            </label>
            <label className="space-y-2 text-sm font-medium text-foreground">
              <span>Incident type</span>
              <Input name="incidentType" />
            </label>
            <label className="space-y-2 text-sm font-medium text-foreground md:col-span-2">
              <span>Description</span>
              <Textarea name="description" rows={3} />
            </label>
            <label className="space-y-2 text-sm font-medium text-foreground">
              <span>Classification</span>
              <Input defaultValue="1" max="3" min="0" name="classification" type="number" />
            </label>
            <label className="space-y-2 text-sm font-medium text-foreground md:col-span-2">
              <span>Fields JSON</span>
              <Textarea
                defaultValue={`[
  {"name":"field_observer","type":"text","label":"Field observer","required":true},
  {"name":"damage_level","type":"select","label":"Damage level","required":true,"options":["low","medium","high"]}
]`}
                name="fieldsJson"
                rows={8}
              />
            </label>
            <div className="md:col-span-2">
              <Button type="submit">Create form</Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card className="border-border/60 bg-white/90 shadow-sm">
        <CardHeader className="gap-3">
          <Badge variant="outline" className="w-fit">
            Registry
          </Badge>
          <div className="space-y-1">
            <CardTitle className="font-heading text-2xl">Data collection forms</CardTitle>
            <CardDescription>Published templates and their submission activity.</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          {forms.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border/70 bg-muted/30 px-4 py-8 text-sm text-muted-foreground">
              No published forms are available.
            </div>
          ) : (
            <div className="space-y-3">
              {forms.map((form) => (
                <Link
                  key={form.id}
                  className="block rounded-3xl border border-border/70 bg-background/80 p-5 transition hover:border-primary/35 hover:shadow-sm"
                  href={`/analytics/forms/${form.id}`}
                >
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-lg font-semibold text-foreground">{form.name}</h3>
                        <Badge variant="outline">{form.status}</Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {form.incidentType ?? "Generic"} | v{form.version} | {form.fieldCount} fields
                      </p>
                      <p className="text-sm text-muted-foreground">
                        Classification {form.classification} | published{" "}
                        {form.publishedAt ?? "not published"}
                      </p>
                    </div>
                    <Badge variant="secondary">{form.submissionCount ?? 0} submissions</Badge>
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
