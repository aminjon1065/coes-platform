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
import { getAnalyticsForm, listAnalyticsFormSubmissions } from "@/lib/analytics";
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
    <div className="space-y-6">
      <Card className="border-border/60 bg-white/90 shadow-sm">
        <CardHeader className="gap-4">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">{form.status}</Badge>
            <Badge variant="secondary">{form.incidentType ?? "Generic"}</Badge>
            <Badge variant="secondary">{form.fieldCount} fields</Badge>
          </div>
          <div className="space-y-1">
            <CardTitle className="font-heading text-3xl">{form.name}</CardTitle>
            <CardDescription>
              Classification {form.classification}
              {form.description ? ` | ${form.description}` : ""}
            </CardDescription>
          </div>
        </CardHeader>
        {form.status !== "published" ? (
          <CardContent>
            <form action={publishAnalyticsFormAction}>
              <input name="formId" type="hidden" value={form.id} />
              <Button type="submit">Publish form</Button>
            </form>
          </CardContent>
        ) : null}
      </Card>

      <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
        <Card className="border-border/60 bg-white/90 shadow-sm">
          <CardHeader>
            <CardTitle className="font-heading text-2xl">Fields</CardTitle>
            <CardDescription>Current field schema for this template.</CardDescription>
          </CardHeader>
          <CardContent>
            <pre className="overflow-x-auto rounded-3xl border border-border/70 bg-slate-950 p-4 text-xs text-slate-100">
              {JSON.stringify(form.fields ?? [], null, 2)}
            </pre>
          </CardContent>
        </Card>

        <Card className="border-border/60 bg-white/90 shadow-sm">
          <CardHeader>
            <CardTitle className="font-heading text-2xl">Submit sample payload</CardTitle>
            <CardDescription>Send a test submission against the template schema.</CardDescription>
          </CardHeader>
          <CardContent>
            <form action={submitAnalyticsFormAction} className="grid gap-4">
              <input name="formId" type="hidden" value={form.id} />
              <div className="grid gap-4 md:grid-cols-2">
                <label className="space-y-2 text-sm font-medium text-foreground">
                  <span>Incident ID</span>
                  <Input name="incidentId" />
                </label>
                <label className="space-y-2 text-sm font-medium text-foreground">
                  <span>Incident ref</span>
                  <Input name="incidentRef" />
                </label>
              </div>
              <label className="space-y-2 text-sm font-medium text-foreground">
                <span>Data JSON</span>
                <Textarea name="dataJson" rows={8} />
              </label>
              <Button type="submit">Submit form</Button>
            </form>
          </CardContent>
        </Card>
      </div>

      <Card className="border-border/60 bg-white/90 shadow-sm">
        <CardHeader>
          <CardTitle className="font-heading text-2xl">Submissions</CardTitle>
          <CardDescription>Review incoming payloads and moderation decisions.</CardDescription>
        </CardHeader>
        <CardContent>
          {submissions.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border/70 bg-muted/30 px-4 py-8 text-sm text-muted-foreground">
              No submissions for this form yet.
            </div>
          ) : (
            <div className="space-y-4">
              {submissions.map((submission) => (
                <div key={submission.id} className="rounded-3xl border border-border/70 bg-background/80 p-5">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline">{submission.status}</Badge>
                    <Badge variant="secondary">
                      {submission.incidentRef ?? submission.incidentId ?? "n/a"}
                    </Badge>
                  </div>
                  <p className="mt-3 text-sm text-muted-foreground">
                    Submitted {submission.submittedAt}
                  </p>
                  <pre className="mt-4 overflow-x-auto rounded-3xl border border-border/70 bg-slate-950 p-4 text-xs text-slate-100">
                    {JSON.stringify(submission.data, null, 2)}
                  </pre>
                  <form action={reviewAnalyticsSubmissionAction} className="mt-4 grid gap-4 md:grid-cols-2">
                    <input name="formId" type="hidden" value={form.id} />
                    <input name="submissionId" type="hidden" value={submission.id} />
                    <label className="space-y-2 text-sm font-medium text-foreground">
                      <span>Review status</span>
                      <select
                        className="flex h-12 w-full rounded-2xl border border-border/70 bg-white/70 px-4 py-3 text-sm text-foreground shadow-sm outline-none focus-visible:border-ring focus-visible:ring-4 focus-visible:ring-ring/15"
                        defaultValue={submission.status}
                        name="status"
                      >
                        <option value="submitted">submitted</option>
                        <option value="under_review">under_review</option>
                        <option value="accepted">accepted</option>
                        <option value="rejected">rejected</option>
                        <option value="requires_revision">requires_revision</option>
                      </select>
                    </label>
                    <label className="space-y-2 text-sm font-medium text-foreground">
                      <span>Notes</span>
                      <Input defaultValue={submission.reviewNotes ?? ""} name="notes" />
                    </label>
                    <div className="md:col-span-2">
                      <Button type="submit" variant="outline">
                        Review submission
                      </Button>
                    </div>
                  </form>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
