import { createPositionAction } from "./actions";
import {
  flattenDepartments,
  getDepartmentTree,
  getPositionAdminRegistry,
  listPositions,
} from "@/lib/admin";
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

const POSITION_LEVELS = [
  "chairman",
  "deputy_chairman",
  "department_head",
  "deputy_head",
  "division_head",
  "senior_specialist",
  "specialist",
  "analyst",
  "operator",
  "clerk",
] as const;

export default async function AdminPositionsPage() {
  const [positions, positionRegistry, departmentTree] = await Promise.all([
    listPositions(),
    getPositionAdminRegistry(),
    getDepartmentTree(),
  ]);
  const departments = flattenDepartments(departmentTree);
  const positionMeta = new Map(positionRegistry.map((position) => [position.id, position] as const));

  return (
    <div className="space-y-6">
      <section className="grid gap-4 xl:grid-cols-[1fr_0.8fr]">
        <Card>
          <CardHeader>
            <Badge className="w-fit">Positions</Badge>
            <CardTitle className="font-display text-3xl">Registry and occupancy</CardTitle>
            <CardDescription>
              Position catalog, current occupants, and chain-of-command context.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-3">
              {positions.length === 0 ? (
                <li className="rounded-2xl border border-dashed border-border bg-background/70 p-4 text-sm text-muted-foreground">
                  No positions configured.
                </li>
              ) : (
                positions.map((position) => {
                  const meta = positionMeta.get(position.id);

                  return (
                    <li className="rounded-3xl border border-border/70 bg-white/70 p-4" key={position.id}>
                      <div className="space-y-4">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div className="space-y-2">
                            <p className="font-semibold text-foreground">{position.title}</p>
                            <p className="text-sm text-muted-foreground">
                              {position.departmentName ?? position.departmentId} · {position.level}
                            </p>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {position.canAssignTasks ? <Badge variant="secondary">tasks</Badge> : null}
                            {position.canApproveDocuments ? <Badge variant="secondary">approve</Badge> : null}
                            {position.canIssueResolutions ? <Badge variant="secondary">resolutions</Badge> : null}
                          </div>
                        </div>
                        <div className="grid gap-3 md:grid-cols-3">
                          <div className="rounded-2xl border border-border/70 bg-background/70 p-4 text-sm text-muted-foreground">
                            <strong className="block text-foreground">Current occupant</strong>
                            {meta?.occupant
                              ? `${meta.occupant.displayName} (${meta.occupant.email})`
                              : "Vacant"}
                          </div>
                          <div className="rounded-2xl border border-border/70 bg-background/70 p-4 text-sm text-muted-foreground">
                            <strong className="block text-foreground">Command chain</strong>
                            {meta?.commandChain.length
                              ? meta.commandChain.map((item) => item.title).join(" -> ")
                              : "No chain"}
                          </div>
                          <div className="rounded-2xl border border-border/70 bg-background/70 p-4 text-sm text-muted-foreground">
                            <strong className="block text-foreground">Assignment history</strong>
                            {meta?.history.length ?? 0} records
                          </div>
                        </div>
                      </div>
                    </li>
                  );
                })
              )}
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="font-display text-3xl">Create position</CardTitle>
            <CardDescription>Define a new position and its operational capabilities.</CardDescription>
          </CardHeader>
          <CardContent>
            <form action={createPositionAction} className="grid gap-4">
              <label className="grid gap-2 text-sm font-medium text-foreground">
                Title
                <Input name="title" required />
              </label>
              <label className="grid gap-2 text-sm font-medium text-foreground">
                Level
                <select
                  className="flex h-12 w-full rounded-2xl border border-border/70 bg-white/70 px-4 py-3 text-sm text-foreground shadow-sm outline-none focus-visible:border-ring focus-visible:ring-4 focus-visible:ring-ring/15"
                  defaultValue={POSITION_LEVELS[2]}
                  name="level"
                >
                  {POSITION_LEVELS.map((level) => (
                    <option key={level} value={level}>
                      {level}
                    </option>
                  ))}
                </select>
              </label>
              <label className="grid gap-2 text-sm font-medium text-foreground">
                Department
                <select
                  className="flex h-12 w-full rounded-2xl border border-border/70 bg-white/70 px-4 py-3 text-sm text-foreground shadow-sm outline-none focus-visible:border-ring focus-visible:ring-4 focus-visible:ring-ring/15"
                  defaultValue=""
                  name="departmentId"
                >
                  <option disabled value="">
                    Select department
                  </option>
                  {departments.map((department) => (
                    <option key={department.id} value={department.id}>
                      {"  ".repeat(department.depth)}
                      {department.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="grid gap-2 text-sm font-medium text-foreground">
                Reports to
                <select
                  className="flex h-12 w-full rounded-2xl border border-border/70 bg-white/70 px-4 py-3 text-sm text-foreground shadow-sm outline-none focus-visible:border-ring focus-visible:ring-4 focus-visible:ring-ring/15"
                  defaultValue=""
                  name="reportsToId"
                >
                  <option value="">Not set</option>
                  {positions.map((position) => (
                    <option key={position.id} value={position.id}>
                      {position.title}
                    </option>
                  ))}
                </select>
              </label>
              <div className="grid gap-3 rounded-3xl border border-border/70 bg-background/70 p-4">
                <label className="flex items-center gap-3 text-sm text-foreground">
                  <input className="size-4 accent-[var(--primary)]" name="canAssignTasks" type="checkbox" />
                  <span>Can assign tasks</span>
                </label>
                <label className="flex items-center gap-3 text-sm text-foreground">
                  <input className="size-4 accent-[var(--primary)]" name="canApproveDocuments" type="checkbox" />
                  <span>Can approve documents</span>
                </label>
                <label className="flex items-center gap-3 text-sm text-foreground">
                  <input className="size-4 accent-[var(--primary)]" name="canIssueResolutions" type="checkbox" />
                  <span>Can issue resolutions</span>
                </label>
              </div>
              <Button className="w-fit" type="submit">
                Create position
              </Button>
            </form>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
