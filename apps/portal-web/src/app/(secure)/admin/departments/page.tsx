import { createDepartmentAction } from "./actions";
import { flattenDepartments, getDepartmentAdminSummary } from "@/lib/admin";
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

type DepartmentTreeProps = {
  nodes: Awaited<ReturnType<typeof getDepartmentAdminSummary>>;
  depth?: number;
};

function DepartmentTree({ nodes, depth = 0 }: DepartmentTreeProps) {
  return (
    <div className="grid gap-3">
      {nodes.map((node) => (
        <div
          className="rounded-3xl border border-border/70 bg-white/70 p-4"
          key={node.id}
          style={{ marginLeft: depth * 18 }}
        >
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-semibold text-foreground">{node.name}</p>
              <Badge variant={node.isActive ? "secondary" : "outline"}>
                {node.isActive ? "active" : "inactive"}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground">{node.code}</p>
            <p className="text-sm text-muted-foreground">
              {node.metrics.positionCount} positions · {node.metrics.occupiedCount} occupied ·{" "}
              {node.metrics.vacantCount} vacant · {node.metrics.userCount} users in subtree
            </p>
          </div>
          {node.children.length > 0 ? (
            <div className="mt-3">
              <DepartmentTree depth={depth + 1} nodes={node.children} />
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}

export default async function AdminDepartmentsPage() {
  const tree = await getDepartmentAdminSummary();
  const flat = flattenDepartments(tree) as Array<(typeof tree)[number] & { depth: number }>;

  return (
    <div className="space-y-6">
      <section className="grid gap-4 xl:grid-cols-[1fr_0.8fr]">
        <Card>
          <CardHeader>
            <Badge className="w-fit">Departments</Badge>
            <CardTitle className="font-display text-3xl">Hierarchy and operational load</CardTitle>
            <CardDescription>
              Department tree with occupancy and subtree user metrics.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {tree.length === 0 ? (
              <p className="rounded-2xl border border-dashed border-border bg-background/70 p-4 text-sm text-muted-foreground">
                No departments configured.
              </p>
            ) : (
              <DepartmentTree nodes={tree} />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="font-display text-3xl">Create department</CardTitle>
            <CardDescription>Add a new root or nested department node.</CardDescription>
          </CardHeader>
          <CardContent>
            <form action={createDepartmentAction} className="grid gap-4">
              <label className="grid gap-2 text-sm font-medium text-foreground">
                Name
                <Input name="name" required />
              </label>
              <label className="grid gap-2 text-sm font-medium text-foreground">
                Code
                <Input name="code" required />
              </label>
              <label className="grid gap-2 text-sm font-medium text-foreground">
                Parent department
                <select
                  className="flex h-12 w-full rounded-2xl border border-border/70 bg-white/70 px-4 py-3 text-sm text-foreground shadow-sm outline-none focus-visible:border-ring focus-visible:ring-4 focus-visible:ring-ring/15"
                  defaultValue=""
                  name="parentDepartmentId"
                >
                  <option value="">Root</option>
                  {flat.map((department) => (
                    <option key={department.id} value={department.id}>
                      {"  ".repeat(department.depth)}
                      {department.name}
                      {department.metrics ? ` (${department.metrics.positionCount} positions)` : ""}
                    </option>
                  ))}
                </select>
              </label>
              <Button className="w-fit" type="submit">
                Create department
              </Button>
            </form>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
