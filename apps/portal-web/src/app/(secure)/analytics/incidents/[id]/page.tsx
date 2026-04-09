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
import {
  getAnalyticsIncident,
  getAnalyticsIncidentResources,
  getAnalyticsIncidentResponses,
} from "@/lib/analytics";
import {
  deployAnalyticsResourceAction,
  recordAnalyticsResponseAction,
  updateAnalyticsIncidentAction,
  withdrawAnalyticsResourceAction,
} from "../../actions";

type AnalyticsIncidentDetailPageProps = {
  params: Promise<{
    id: string;
  }>;
};

export default async function AnalyticsIncidentDetailPage({
  params,
}: AnalyticsIncidentDetailPageProps) {
  const { id } = await params;
  const [incident, responses, resources] = await Promise.all([
    getAnalyticsIncident(id),
    getAnalyticsIncidentResponses(id),
    getAnalyticsIncidentResources(id),
  ]);

  return (
    <div className="space-y-6">
      <Card className="border-border/60 bg-white/90 shadow-sm">
        <CardHeader className="gap-4">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">{incident.incidentRef}</Badge>
            <Badge variant="secondary">{incident.status}</Badge>
            <Badge variant="secondary">{incident.severity}</Badge>
          </div>
          <div className="space-y-1">
            <CardTitle className="font-heading text-3xl">{incident.title}</CardTitle>
            <CardDescription>
              {incident.incidentType} in{" "}
              {incident.administrativeName ?? incident.administrativeCode ?? "unassigned region"}
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-2xl border border-border/70 bg-muted/30 p-4">
            <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Reported</p>
            <p className="mt-2 text-sm font-medium text-foreground">{incident.reportedAt}</p>
          </div>
          <div className="rounded-2xl border border-border/70 bg-muted/30 p-4">
            <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">First response</p>
            <p className="mt-2 text-sm font-medium text-foreground">{incident.firstResponseAt ?? "n/a"}</p>
          </div>
          <div className="rounded-2xl border border-border/70 bg-muted/30 p-4">
            <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Affected population</p>
            <p className="mt-2 text-sm font-medium text-foreground">{incident.affectedPopulation ?? 0}</p>
          </div>
          <div className="rounded-2xl border border-border/70 bg-muted/30 p-4">
            <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Casualties</p>
            <p className="mt-2 text-sm font-medium text-foreground">
              {incident.casualtiesConfirmed} confirmed / {incident.casualtiesSuspected} suspected
            </p>
          </div>
        </CardContent>
      </Card>

      <Card className="border-border/60 bg-white/90 shadow-sm">
        <CardHeader>
          <CardTitle className="font-heading text-2xl">Update incident</CardTitle>
          <CardDescription>Refresh incident severity, status, and operational notes.</CardDescription>
        </CardHeader>
        <CardContent>
          <form action={updateAnalyticsIncidentAction} className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <input name="incidentId" type="hidden" value={incident.id} />
            <label className="space-y-2 text-sm font-medium text-foreground">
              <span>Status</span>
              <select
                className="flex h-12 w-full rounded-2xl border border-border/70 bg-white/70 px-4 py-3 text-sm text-foreground shadow-sm outline-none focus-visible:border-ring focus-visible:ring-4 focus-visible:ring-ring/15"
                defaultValue={incident.status}
                name="status"
              >
                <option value="">Keep current</option>
                <option value="open">open</option>
                <option value="responding">responding</option>
                <option value="contained">contained</option>
                <option value="resolved">resolved</option>
                <option value="closed">closed</option>
                <option value="cancelled">cancelled</option>
              </select>
            </label>
            <label className="space-y-2 text-sm font-medium text-foreground">
              <span>Severity</span>
              <select
                className="flex h-12 w-full rounded-2xl border border-border/70 bg-white/70 px-4 py-3 text-sm text-foreground shadow-sm outline-none focus-visible:border-ring focus-visible:ring-4 focus-visible:ring-ring/15"
                defaultValue={incident.severity}
                name="severity"
              >
                <option value="">Keep current</option>
                <option value="minor">minor</option>
                <option value="moderate">moderate</option>
                <option value="major">major</option>
                <option value="catastrophic">catastrophic</option>
              </select>
            </label>
            <label className="space-y-2 text-sm font-medium text-foreground">
              <span>Affected population</span>
              <Input defaultValue={incident.affectedPopulation ?? ""} min="0" name="affectedPopulation" type="number" />
            </label>
            <label className="space-y-2 text-sm font-medium text-foreground">
              <span>Confirmed casualties</span>
              <Input defaultValue={incident.casualtiesConfirmed} min="0" name="casualtiesConfirmed" type="number" />
            </label>
            <label className="space-y-2 text-sm font-medium text-foreground">
              <span>Suspected casualties</span>
              <Input defaultValue={incident.casualtiesSuspected} min="0" name="casualtiesSuspected" type="number" />
            </label>
            <label className="space-y-2 text-sm font-medium text-foreground">
              <span>Affected area km2</span>
              <Input defaultValue={incident.affectedAreaKm2 ?? ""} min="0" name="affectedAreaKm2" step="0.1" type="number" />
            </label>
            <label className="space-y-2 text-sm font-medium text-foreground md:col-span-2 xl:col-span-3">
              <span>Internal notes</span>
              <Textarea defaultValue="" name="internalNotes" rows={4} />
            </label>
            <div className="md:col-span-2 xl:col-span-3">
              <Button type="submit">Update incident</Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <Card className="border-border/60 bg-white/90 shadow-sm">
          <CardHeader>
            <CardTitle className="font-heading text-2xl">Response timeline</CardTitle>
            <CardDescription>Record operational actions taken for this incident.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <form action={recordAnalyticsResponseAction} className="grid gap-4 md:grid-cols-2">
              <input name="incidentId" type="hidden" value={incident.id} />
              <label className="space-y-2 text-sm font-medium text-foreground">
                <span>Action</span>
                <select
                  className="flex h-12 w-full rounded-2xl border border-border/70 bg-white/70 px-4 py-3 text-sm text-foreground shadow-sm outline-none focus-visible:border-ring focus-visible:ring-4 focus-visible:ring-ring/15"
                  defaultValue="dispatched"
                  name="action"
                >
                  <option value="dispatched">dispatched</option>
                  <option value="on_scene">on_scene</option>
                  <option value="evacuated">evacuated</option>
                  <option value="contained">contained</option>
                  <option value="remediated">remediated</option>
                  <option value="assessment_completed">assessment_completed</option>
                  <option value="report_filed">report_filed</option>
                  <option value="resources_released">resources_released</option>
                </select>
              </label>
              <label className="space-y-2 text-sm font-medium text-foreground">
                <span>Description</span>
                <Input name="description" />
              </label>
              <label className="space-y-2 text-sm font-medium text-foreground md:col-span-2">
                <span>Outcome</span>
                <Input name="outcome" />
              </label>
              <div className="md:col-span-2">
                <Button type="submit">Record response</Button>
              </div>
            </form>
            {responses.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border/70 bg-muted/30 px-4 py-8 text-sm text-muted-foreground">
                No response actions recorded.
              </div>
            ) : (
              <div className="space-y-3">
                {responses.map((response) => (
                  <div key={response.id} className="rounded-2xl border border-border/70 bg-background/80 p-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-base font-semibold text-foreground">{response.action}</p>
                      <Badge variant="outline">{response.occurredAt}</Badge>
                    </div>
                    <p className="mt-2 text-sm text-muted-foreground">
                      {response.description ?? "No description"}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-border/60 bg-white/90 shadow-sm">
          <CardHeader>
            <CardTitle className="font-heading text-2xl">Resource deployments</CardTitle>
            <CardDescription>Track active and completed resource allocations.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <form action={deployAnalyticsResourceAction} className="grid gap-4">
              <input name="incidentId" type="hidden" value={incident.id} />
              <label className="space-y-2 text-sm font-medium text-foreground">
                <span>Resource type</span>
                <select
                  className="flex h-12 w-full rounded-2xl border border-border/70 bg-white/70 px-4 py-3 text-sm text-foreground shadow-sm outline-none focus-visible:border-ring focus-visible:ring-4 focus-visible:ring-ring/15"
                  defaultValue="personnel"
                  name="resourceType"
                >
                  <option value="personnel">personnel</option>
                  <option value="vehicle">vehicle</option>
                  <option value="equipment">equipment</option>
                  <option value="medical">medical</option>
                  <option value="shelter">shelter</option>
                  <option value="food_water">food_water</option>
                  <option value="communication">communication</option>
                  <option value="aerial">aerial</option>
                  <option value="other">other</option>
                </select>
              </label>
              <label className="space-y-2 text-sm font-medium text-foreground">
                <span>Resource name</span>
                <Input name="resourceName" required />
              </label>
              <div className="grid gap-4 md:grid-cols-2">
                <label className="space-y-2 text-sm font-medium text-foreground">
                  <span>Quantity</span>
                  <Input defaultValue="1" min="1" name="quantity" type="number" />
                </label>
                <label className="space-y-2 text-sm font-medium text-foreground">
                  <span>Unit</span>
                  <Input name="unit" />
                </label>
              </div>
              <Button type="submit">Deploy resource</Button>
            </form>
            {resources.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border/70 bg-muted/30 px-4 py-8 text-sm text-muted-foreground">
                No resource deployments recorded.
              </div>
            ) : (
              <div className="space-y-3">
                {resources.map((resource) => (
                  <div key={resource.id} className="rounded-2xl border border-border/70 bg-background/80 p-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-base font-semibold text-foreground">{resource.resourceName}</p>
                      <Badge variant="outline">{resource.resourceType}</Badge>
                    </div>
                    <p className="mt-2 text-sm text-muted-foreground">
                      {resource.quantity} {resource.unit ?? "units"} | deployed {resource.deployedAt}
                    </p>
                    {resource.withdrawnAt ? (
                      <p className="mt-2 text-sm text-muted-foreground">Withdrawn {resource.withdrawnAt}</p>
                    ) : (
                      <form action={withdrawAnalyticsResourceAction} className="mt-3">
                        <input name="incidentId" type="hidden" value={incident.id} />
                        <input name="resourceId" type="hidden" value={resource.id} />
                        <Button type="submit" variant="outline">
                          Withdraw
                        </Button>
                      </form>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
